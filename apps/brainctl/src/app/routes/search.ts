import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { unifiedSearch, vsearch, think } from '../services/search.service.js';
import { isVecLoaded, getDb } from '../db/database.js';
import { getMemoriesWithoutEmbeddings } from '../services/memory.service.js';
import { getEntitiesWithoutEmbeddings } from '../services/entity.service.js';
import { getEventsWithoutEmbeddings } from '../services/event.service.js';
import { serializeVec, isEmbeddingAvailable, embedBatch } from '../services/embeddings.service.js';

export async function SearchRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const results = await unifiedSearch(req.query.q, req.query.limit, req.query.agent_id);
    return reply.send(results);
  });

  f.get('/vsearch', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    if (!isVecLoaded() || !isEmbeddingAvailable()) {
      return reply.status(503).send({ error: 'Vector search unavailable — configure LITELLM_BASE_URL' });
    }
    const results = await vsearch(req.query.q, req.query.limit, req.query.agent_id);
    return reply.send(results);
  });

  f.get('/think', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        seed_limit: z.coerce.number().int().min(1).max(20).optional(),
        hops: z.coerce.number().int().min(1).max(5).optional(),
        decay: z.coerce.number().min(0).max(1).optional(),
        top_k: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const result = await think(
      req.query.q,
      req.query.agent_id,
      req.query.seed_limit,
      req.query.hops,
      req.query.decay,
      req.query.top_k,
    );
    return reply.send(result);
  });

  // Backfill embeddings for existing records that don't have vectors yet.
  // Processes up to `batch_size` records per call; repeat until exhausted.
  f.post('/embeddings/backfill', {
    schema: {
      body: z.object({
        agent_id: z.string().optional(),
        batch_size: z.number().int().min(1).max(500).optional(),
        table: z.enum(['memories', 'entities', 'events', 'all']).optional(),
      }),
      response: {
        200: z.object({
          memories_processed: z.number(),
          entities_processed: z.number(),
          events_processed: z.number(),
          vec_available: z.boolean(),
          embedding_available: z.boolean(),
        }),
      },
    },
  }, async (req, reply) => {
    const vecAvailable = isVecLoaded();
    const embAvailable = isEmbeddingAvailable();

    if (!vecAvailable || !embAvailable) {
      return reply.send({
        memories_processed: 0,
        entities_processed: 0,
        events_processed: 0,
        vec_available: vecAvailable,
        embedding_available: embAvailable,
      });
    }

    const db = getDb();
    const agentId = req.body.agent_id ?? 'default';
    const batchSize = req.body.batch_size ?? 100;
    const table = req.body.table ?? 'all';

    let memoriesProcessed = 0;
    let entitiesProcessed = 0;
    let eventsProcessed = 0;

    if (table === 'memories' || table === 'all') {
      const rows = getMemoriesWithoutEmbeddings(agentId, batchSize);
      if (rows.length) {
        const vecs = await embedBatch(rows.map((r) => r.content));
        const insert = db.prepare('INSERT OR REPLACE INTO vec_memories(rowid, embedding) VALUES (?, ?)');
        const tx = db.transaction(() => {
          for (let i = 0; i < rows.length; i++) {
            const vec = vecs[i];
            if (vec) { insert.run(rows[i].id, serializeVec(vec)); memoriesProcessed++; }
          }
        });
        tx();
      }
    }

    if (table === 'entities' || table === 'all') {
      const rows = getEntitiesWithoutEmbeddings(agentId, batchSize);
      if (rows.length) {
        const texts = rows.map((r) =>
          [r.name, r.entity_type, r.observations ? JSON.parse(r.observations).join(' ') : ''].join(' ')
        );
        const vecs = await embedBatch(texts);
        const insert = db.prepare('INSERT OR REPLACE INTO vec_entities(rowid, embedding) VALUES (?, ?)');
        const tx = db.transaction(() => {
          for (let i = 0; i < rows.length; i++) {
            const vec = vecs[i];
            if (vec) { insert.run(rows[i].id, serializeVec(vec)); entitiesProcessed++; }
          }
        });
        tx();
      }
    }

    if (table === 'events' || table === 'all') {
      const rows = getEventsWithoutEmbeddings(agentId, batchSize);
      if (rows.length) {
        const vecs = await embedBatch(rows.map((r) => r.summary));
        const insert = db.prepare('INSERT OR REPLACE INTO vec_events(rowid, embedding) VALUES (?, ?)');
        const tx = db.transaction(() => {
          for (let i = 0; i < rows.length; i++) {
            const vec = vecs[i];
            if (vec) { insert.run(rows[i].id, serializeVec(vec)); eventsProcessed++; }
          }
        });
        tx();
      }
    }

    return reply.send({
      memories_processed: memoriesProcessed,
      entities_processed: entitiesProcessed,
      events_processed: eventsProcessed,
      vec_available: vecAvailable,
      embedding_available: embAvailable,
    });
  });
}
