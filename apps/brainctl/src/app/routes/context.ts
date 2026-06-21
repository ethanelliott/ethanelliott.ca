import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ingestDocument, getDocument, listDocuments, deleteDocument, searchContext, getChunk,
} from '../services/context.service.js';

const AgentQ = z.object({ agent_id: z.string().optional() });

export async function ContextRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // Ingest (or re-ingest) a named document — auto-chunks by word count
  f.put('/context/:document', {
    schema: {
      params: z.object({ document: z.string().min(1) }),
      body: z.object({
        content: z.string().min(1),
        chunk_size: z.number().int().min(50).max(2000).optional(),
        overlap: z.number().int().min(0).max(500).optional(),
        metadata: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const result = await ingestDocument({ document: req.params.document, ...req.body });
    return reply.status(201).send(result);
  });

  // List all documents for an agent
  f.get('/context', {
    schema: { querystring: AgentQ },
  }, async (req, reply) => reply.send(listDocuments(req.query.agent_id ?? 'default')));

  // Retrieve all chunks for a document
  f.get('/context/:document', {
    schema: {
      params: z.object({ document: z.string().min(1) }),
      querystring: AgentQ,
    },
  }, async (req, reply) => {
    const chunks = getDocument(req.params.document, req.query.agent_id ?? 'default');
    if (!chunks.length) return reply.status(404).send({ error: 'Document not found' });
    return reply.send(chunks);
  });

  // Retrieve a specific chunk by index
  f.get('/context/:document/:chunk_index', {
    schema: {
      params: z.object({
        document: z.string().min(1),
        chunk_index: z.coerce.number().int().min(0),
      }),
      querystring: AgentQ,
    },
  }, async (req, reply) => {
    const chunk = getChunk(req.params.document, req.params.chunk_index, req.query.agent_id ?? 'default');
    if (!chunk) return reply.status(404).send({ error: 'Chunk not found' });
    return reply.send(chunk);
  });

  // Delete a document and all its chunks
  f.delete('/context/:document', {
    schema: {
      params: z.object({ document: z.string().min(1) }),
      querystring: AgentQ,
    },
  }, async (req, reply) => {
    const deleted = deleteDocument(req.params.document, req.query.agent_id ?? 'default');
    return reply.send({ deleted });
  });

  // Hybrid semantic search over context chunks
  f.post('/context/search', {
    schema: {
      body: z.object({
        query: z.string().min(1),
        document: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(await searchContext(req.body)));
}
