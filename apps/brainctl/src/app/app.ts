import { FastifyInstance } from 'fastify';
import { MemoryRoutes } from './routes/memory.js';
import { EventRoutes } from './routes/events.js';
import { EntityRoutes } from './routes/entities.js';
import { DecisionRoutes } from './routes/decisions.js';
import { SessionRoutes } from './routes/session.js';
import { TriggerRoutes } from './routes/triggers.js';
import { ProcedureRoutes } from './routes/procedures.js';
import { SearchRoutes } from './routes/search.js';
import { AffectRoutes } from './routes/affect.js';
import { DiagnosticsRoutes } from './routes/diagnostics.js';
import { ConsolidationRoutes } from './routes/consolidation.js';
import { ReasoningRoutes } from './routes/reasoning.js';
import { SchedulerRoutes } from './routes/scheduler.js';

export async function Application(fastify: FastifyInstance) {
  fastify.register(MemoryRoutes);
  fastify.register(EventRoutes);
  fastify.register(EntityRoutes);
  fastify.register(DecisionRoutes);
  fastify.register(SessionRoutes);
  fastify.register(TriggerRoutes);
  fastify.register(ProcedureRoutes);
  fastify.register(SearchRoutes);
  fastify.register(AffectRoutes);
  fastify.register(DiagnosticsRoutes);
  fastify.register(ConsolidationRoutes);
  fastify.register(ReasoningRoutes);
  fastify.register(SchedulerRoutes);
}
