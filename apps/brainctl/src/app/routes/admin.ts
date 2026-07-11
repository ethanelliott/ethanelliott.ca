import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { addMemory } from '../services/memory.service.js';
import { join } from 'path';

export async function AdminRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // Bulk import memories
  f.post('/admin/memories/bulk', {
    schema: {
      body: z.object({
        memories: z.array(z.object({
          content: z.string().min(1),
          category: z.string().optional(),
          tags: z.union([z.string(), z.array(z.string())]).optional(),
          confidence: z.number().min(0).max(1).optional(),
          memory_type: z.enum(['episodic', 'semantic', 'procedural']).optional(),
          scope: z.string().optional(),
        })).min(1).max(1000),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const agentId = req.body.agent_id ?? 'default';
    const ids: number[] = [];
    for (const m of req.body.memories) {
      ids.push(await addMemory({ ...m, agent_id: agentId }));
    }
    return reply.status(201).send({ inserted: ids.length, ids });
  });

  // Purge all retired memories (hard delete)
  f.delete('/admin/memories/retired', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        older_than_days: z.coerce.number().int().min(1).optional(),
      }),
    },
  }, async (req, reply) => {
    const db = getDb();
    const agentId = req.query.agent_id ?? 'default';
    let sql = 'DELETE FROM memories WHERE agent_id = @agent_id AND retired_at IS NOT NULL';
    const params: Record<string, unknown> = { agent_id: agentId };

    if (req.query.older_than_days) {
      sql += ' AND julianday(\'now\') - julianday(retired_at) > @days';
      params['days'] = req.query.older_than_days;
    }

    const result = db.prepare(sql).run(params);
    return reply.send({ deleted: result.changes });
  });

  // Export all agent data as JSON
  f.get('/admin/export', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const db = getDb();
    const agentId = req.query.agent_id ?? 'default';

    const data = {
      exported_at: new Date().toISOString(),
      agent_id: agentId,
      memories: db.prepare('SELECT * FROM memories WHERE agent_id = ?').all(agentId),
      events: db.prepare('SELECT * FROM events WHERE agent_id = ?').all(agentId),
      entities: db.prepare('SELECT * FROM entities WHERE agent_id = ?').all(agentId),
      decisions: db.prepare('SELECT * FROM decisions WHERE agent_id = ?').all(agentId),
      procedures: db.prepare('SELECT * FROM procedures WHERE agent_id = ?').all(agentId),
      triggers: db.prepare('SELECT * FROM triggers WHERE agent_id = ?').all(agentId),
      handoffs: db.prepare('SELECT * FROM handoffs WHERE agent_id = ?').all(agentId),
      knowledge_edges: db.prepare(`
        SELECT ke.* FROM knowledge_edges ke
        WHERE EXISTS (
          SELECT 1 FROM memories m WHERE m.id = ke.from_id AND m.agent_id = ?
          UNION SELECT 1 FROM memories m WHERE m.id = ke.to_id AND m.agent_id = ?
          UNION SELECT 1 FROM entities e WHERE e.id = ke.from_id AND e.agent_id = ?
          UNION SELECT 1 FROM entities e WHERE e.id = ke.to_id AND e.agent_id = ?
        )
      `).all(agentId, agentId, agentId, agentId),
    };

    reply.header('Content-Disposition', `attachment; filename="brain-${agentId}-${Date.now()}.json"`);
    return reply.send(data);
  });

  // Wipe all data for an agent (irreversible — requires confirm=true)
  f.delete('/admin/agent', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        confirm: z.literal('true'),
      }),
    },
  }, async (req, reply) => {
    const db = getDb();
    const agentId = req.query.agent_id ?? 'default';

    const tables = ['memories', 'events', 'entities', 'decisions', 'procedures',
      'procedure_feedback', 'triggers', 'handoffs', 'agent_state', 'affect_log', 'consolidation_log'];

    db.transaction(() => {
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table} WHERE agent_id = ?`).run(agentId);
      }
      // Remove edges where both endpoints belonged to this agent (best effort)
      db.prepare(`
        DELETE FROM knowledge_edges WHERE from_id IN (
          SELECT id FROM memories WHERE agent_id = ?
        ) OR to_id IN (
          SELECT id FROM memories WHERE agent_id = ?
        )
      `).run(agentId, agentId);
    })();

    return reply.send({ wiped: agentId });
  });

  // Streaming SQLite backup
  f.get('/admin/backup', async (_req, reply) => {
    const srcPath = process.env['BRAIN_DB'] ?? join(process.env['HOME'] ?? '/tmp', 'brainctl', 'brain.db');
    const tmpPath = `${srcPath}.backup-${Date.now()}.db`;
    const src = getDb();

    await src.backup(tmpPath);

    const buf = await import('fs/promises').then((fs) => fs.readFile(tmpPath));
    await import('fs/promises').then((fs) => fs.unlink(tmpPath)).catch(() => {});

    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="brain-backup-${Date.now()}.db"`);
    return reply.send(buf);
  });

  // Rebuild FTS indexes (useful after bulk imports or corruption)
  f.post('/admin/reindex', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (_req, reply) => {
    const db = getDb();
    db.exec(`
      INSERT INTO memories_fts(memories_fts) VALUES('rebuild');
      INSERT INTO entities_fts(entities_fts) VALUES('rebuild');
      INSERT INTO events_fts(events_fts) VALUES('rebuild');
      INSERT INTO procedures_fts(procedures_fts) VALUES('rebuild');
    `);
    return reply.send({ reindexed: true });
  });

  // Memory stats broken down by category and type
  f.get('/admin/breakdown', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const db = getDb();
    const agentId = req.query.agent_id ?? 'default';

    const byCategory = db.prepare(`
      SELECT category, memory_type, COUNT(*) AS count, AVG(confidence) AS avg_confidence
      FROM memories WHERE agent_id = ? AND retired_at IS NULL
      GROUP BY category, memory_type ORDER BY count DESC
    `).all(agentId);

    const byTemporalClass = db.prepare(`
      SELECT temporal_class, COUNT(*) AS count, AVG(confidence) AS avg_confidence
      FROM memories WHERE agent_id = ? AND retired_at IS NULL
      GROUP BY temporal_class
    `).all(agentId);

    const topAccessed = db.prepare(`
      SELECT id, content, recalled_count, last_accessed_at, confidence
      FROM memories WHERE agent_id = ? AND retired_at IS NULL
      ORDER BY recalled_count DESC LIMIT 20
    `).all(agentId);

    return reply.send({ by_category: byCategory, by_temporal_class: byTemporalClass, top_accessed: topAccessed });
  });
}
