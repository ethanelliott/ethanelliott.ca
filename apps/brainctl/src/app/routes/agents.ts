import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { addMemory } from '../services/memory.service.js';

export async function AgentRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // List all known agents (discovered from data across all tables)
  f.get('/agents', async (_req, reply) => {
    const db = getDb();
    const agents = db.prepare(`
      SELECT agent_id,
        (SELECT COUNT(*) FROM memories WHERE agent_id = a.agent_id AND retired_at IS NULL) AS memories,
        (SELECT COUNT(*) FROM events WHERE agent_id = a.agent_id) AS events,
        (SELECT COUNT(*) FROM entities WHERE agent_id = a.agent_id) AS entities,
        (SELECT MAX(created_at) FROM memories WHERE agent_id = a.agent_id) AS last_memory_at,
        (SELECT MAX(created_at) FROM events WHERE agent_id = a.agent_id) AS last_event_at
      FROM (
        SELECT DISTINCT agent_id FROM memories
        UNION SELECT DISTINCT agent_id FROM events
        UNION SELECT DISTINCT agent_id FROM entities
        UNION SELECT DISTINCT agent_id FROM handoffs
      ) a
      ORDER BY last_memory_at DESC NULLS LAST
    `).all();
    return reply.send(agents);
  });

  // Get/set per-agent key-value state
  f.get('/agents/:id/state', {
    schema: {
      params: z.object({ id: z.string() }),
      querystring: z.object({ key: z.string().optional() }),
    },
  }, async (req, reply) => {
    const db = getDb();
    if (req.query.key) {
      const row = db.prepare('SELECT value FROM agent_state WHERE agent_id = ? AND key = ?')
        .get(req.params.id, req.query.key) as { value: string } | undefined;
      return reply.send(row ? { key: req.query.key, value: JSON.parse(row.value) } : null);
    }
    const rows = db.prepare('SELECT key, value FROM agent_state WHERE agent_id = ?')
      .all(req.params.id) as Array<{ key: string; value: string }>;
    return reply.send(Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])));
  });

  f.put('/agents/:id/state', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.record(z.unknown()),
    },
  }, async (req, reply) => {
    const db = getDb();
    const agentId = req.params.id;
    const upsert = db.prepare(`
      INSERT INTO agent_state (agent_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT (agent_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    db.transaction(() => {
      for (const [key, val] of Object.entries(req.body)) {
        upsert.run(agentId, key, JSON.stringify(val));
      }
    })();
    return reply.send({ updated: Object.keys(req.body).length });
  });

  f.delete('/agents/:id/state/:key', {
    schema: { params: z.object({ id: z.string(), key: z.string() }) },
  }, async (req, reply) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM agent_state WHERE agent_id = ? AND key = ?')
      .run(req.params.id, req.params.key);
    return reply.send({ deleted: result.changes > 0 });
  });

  // Cross-agent memory sharing: copy memories from one agent to another
  f.post('/agents/:id/share', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        to_agent: z.string().min(1),
        memory_ids: z.array(z.number().int()).min(1).max(500).optional(),
        category: z.string().optional(),
        scope: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const db = getDb();
    const fromAgent = req.params.id;
    const toAgent = req.body.to_agent;

    let sql = 'SELECT * FROM memories WHERE agent_id = @from AND retired_at IS NULL';
    const params: Record<string, unknown> = { from: fromAgent };

    if (req.body.memory_ids?.length) {
      sql += ` AND id IN (${req.body.memory_ids.map(() => '?').join(',')})`;
    }
    if (req.body.category) { sql += ' AND category = @cat'; params['cat'] = req.body.category; }
    if (req.body.scope) { sql += ' AND scope = @scope'; params['scope'] = req.body.scope; }

    const stmt = req.body.memory_ids?.length
      ? db.prepare(sql.replace('?', req.body.memory_ids.map(() => '?').join(',')))
      : db.prepare(sql);

    const memories = req.body.memory_ids?.length
      ? stmt.all(...Object.values(params), ...req.body.memory_ids)
      : stmt.all(params);

    const ids: number[] = [];
    for (const m of memories as any[]) {
      ids.push(await addMemory({
        content: m.content,
        category: m.category,
        tags: m.tags,
        confidence: m.confidence,
        memory_type: m.memory_type,
        scope: m.scope,
        agent_id: toAgent,
      }));
    }

    return reply.status(201).send({ shared: ids.length, ids });
  });

  // Agent-to-agent handoff: get the sender's latest handoff and surface it for the recipient
  f.post('/agents/:id/transfer', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        to_agent: z.string().min(1),
        project: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const db = getDb();
    const fromAgent = req.params.id;
    const toAgent = req.body.to_agent;

    const handoff = db.prepare(`
      SELECT * FROM handoffs
      WHERE agent_id = @agent_id AND consumed_at IS NULL
      ${req.body.project ? 'AND project = @project' : ''}
      ORDER BY created_at DESC LIMIT 1
    `).get({ agent_id: fromAgent, ...(req.body.project ? { project: req.body.project } : {}) }) as any;

    if (!handoff) return reply.status(404).send({ error: 'No pending handoff for source agent' });

    const result = db.prepare(`
      INSERT INTO handoffs (agent_id, goal, current_state, open_loops, next_step, project, title)
      VALUES (@agent_id, @goal, @current_state, @open_loops, @next_step, @project, @title)
    `).run({
      agent_id: toAgent,
      goal: handoff.goal,
      current_state: handoff.current_state,
      open_loops: handoff.open_loops,
      next_step: handoff.next_step,
      project: handoff.project,
      title: `[transferred from ${fromAgent}] ${handoff.title ?? ''}`.trim(),
    });

    // Mark original consumed
    db.prepare('UPDATE handoffs SET consumed_at = datetime(\'now\') WHERE id = ?').run(handoff.id);

    return reply.status(201).send({ handoff_id: result.lastInsertRowid, to_agent: toAgent });
  });
}
