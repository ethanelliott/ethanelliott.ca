import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getDb } from '../db/database.js';

// The canonical list of built-in subsystems and their backing tables
const SUBSYSTEM_REGISTRY: Array<{
  name: string;
  table: string;
  description: string;
  operations: string[];
}> = [
  { name: 'belief', table: 'beliefs', description: 'Graded beliefs with confidence tracking', operations: ['upsert', 'list'] },
  { name: 'trust', table: 'trust_records', description: 'Trust scores for named sources', operations: ['record_interaction', 'get', 'list'] },
  { name: 'reflexion', table: 'reflections', description: 'Action/outcome reflection with lesson extraction', operations: ['reflect', 'list'] },
  { name: 'workspace', table: 'workspace', description: 'Scoped scratchpad for in-progress work', operations: ['upsert', 'get', 'list'] },
  { name: 'task', table: 'tasks', description: 'Shared task queue with status tracking', operations: ['create', 'update_status', 'list'] },
  { name: 'policy', table: 'policies', description: 'Named rules with LLM evaluation', operations: ['upsert', 'evaluate', 'list'] },
];

function ensureSubsystemConfigTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS subsystem_config (
      agent_id TEXT NOT NULL,
      subsystem TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, subsystem, key)
    );
  `);
}

function ensureSubsystemEventLog(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS subsystem_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      subsystem TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ssevents_agent ON subsystem_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_ssevents_subsystem ON subsystem_events(subsystem);
  `);
}

export async function SubsystemMetaRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // List all registered subsystems with live table-row counts
  f.get('/subsystems', {
    schema: { querystring: z.object({ agent_id: z.string().optional() }) },
  }, async (req, reply) => {
    const db = getDb();
    const agentId = req.query.agent_id ?? 'default';

    const subsystems = SUBSYSTEM_REGISTRY.map((s) => {
      let count = 0;
      try {
        const row = db.prepare(`SELECT COUNT(*) AS c FROM ${s.table} WHERE agent_id = ?`)
          .get(agentId) as { c: number } | undefined;
        count = row?.c ?? 0;
      } catch { /* table not yet created */ }
      return { ...s, record_count: count };
    });

    return reply.send(subsystems);
  });

  // Emit a generic event to a subsystem (appended to audit log)
  f.post('/subsystems/:name/emit', {
    schema: {
      params: z.object({ name: z.string().min(1) }),
      body: z.object({
        event_type: z.string().min(1),
        payload: z.record(z.unknown()).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const known = SUBSYSTEM_REGISTRY.find((s) => s.name === req.params.name);
    if (!known) return reply.status(404).send({ error: `Unknown subsystem: ${req.params.name}` });

    ensureSubsystemEventLog();
    const result = getDb().prepare(`
      INSERT INTO subsystem_events (agent_id, subsystem, event_type, payload)
      VALUES (?, ?, ?, ?)
    `).run(
      req.body.agent_id ?? 'default',
      req.params.name,
      req.body.event_type,
      JSON.stringify(req.body.payload ?? {}),
    );

    return reply.status(201).send({ id: result.lastInsertRowid });
  });

  // Get subsystem event log
  f.get('/subsystems/:name/events', {
    schema: {
      params: z.object({ name: z.string().min(1) }),
      querystring: z.object({
        agent_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
  }, async (req, reply) => {
    ensureSubsystemEventLog();
    const rows = getDb().prepare(`
      SELECT * FROM subsystem_events
      WHERE subsystem = ? AND agent_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(req.params.name, req.query.agent_id ?? 'default', req.query.limit ?? 50);
    return reply.send(rows);
  });

  // Configure a subsystem (key-value settings per agent)
  f.put('/subsystems/:name/config', {
    schema: {
      params: z.object({ name: z.string().min(1) }),
      body: z.object({
        config: z.record(z.unknown()),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const known = SUBSYSTEM_REGISTRY.find((s) => s.name === req.params.name);
    if (!known) return reply.status(404).send({ error: `Unknown subsystem: ${req.params.name}` });

    ensureSubsystemConfigTable();
    const db = getDb();
    const agentId = req.body.agent_id ?? 'default';
    const upsert = db.prepare(`
      INSERT INTO subsystem_config (agent_id, subsystem, key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (agent_id, subsystem, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    db.transaction(() => {
      for (const [k, v] of Object.entries(req.body.config)) {
        upsert.run(agentId, req.params.name, k, JSON.stringify(v));
      }
    })();
    return reply.send({ configured: Object.keys(req.body.config).length });
  });

  // Get subsystem config for an agent
  f.get('/subsystems/:name/config', {
    schema: {
      params: z.object({ name: z.string().min(1) }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    ensureSubsystemConfigTable();
    const rows = getDb().prepare(`
      SELECT key, value FROM subsystem_config
      WHERE subsystem = ? AND agent_id = ?
    `).all(req.params.name, req.query.agent_id ?? 'default') as Array<{ key: string; value: string }>;
    return reply.send(Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])));
  });
}
