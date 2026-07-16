import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  WorkflowGraphSchema,
  WorkflowSettingsSchema,
} from './workflow.types';
import { getStepRegistry } from './step-registry';
import { validateGraph, getWorkflowEngine } from './engine';
import { isValidCron, nextCronOccurrence } from './scheduler';
import {
  getWorkflowRepos,
  isWorkflowDbAvailable,
  getWorkflowDbError,
} from './db';

const WorkflowBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  graph: WorkflowGraphSchema,
  settings: WorkflowSettingsSchema.optional(),
  enabled: z.boolean().optional(),
  cron: z
    .string()
    .max(100)
    .refine(isValidCron, 'Invalid cron expression (expected 5-field cron)')
    .nullable()
    .optional(),
});

/** Next firing time for an enabled, scheduled workflow (else null) */
function computeNextRunAt(
  cron: string | null | undefined,
  enabled: boolean
): Date | null {
  if (!cron || !enabled) return null;
  return nextCronOccurrence(cron);
}

export const WorkflowsRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Everything below needs the database — fail fast with a clear message
  app.addHook('onRequest', async (request, reply) => {
    // The step-types palette works without persistence
    if (request.url.includes('/step-types')) return;
    if (!isWorkflowDbAvailable()) {
      return reply.status(503).send({
        error: 'Workflow persistence unavailable',
        detail: getWorkflowDbError() || 'Database not connected',
      });
    }
  });

  /**
   * GET /workflows/step-types
   * The palette: every registered step kind with its config schema.
   */
  app.get('/step-types', async () => {
    const steps = getStepRegistry().getAll();
    return {
      count: steps.length,
      stepTypes: steps.map((s) => ({
        kind: s.kind,
        name: s.name,
        description: s.description,
        category: s.category,
        isTrigger: s.isTrigger === true,
        configSchema: s.configSchema,
      })),
    };
  });

  /**
   * POST /workflows/validate
   * Validate a graph without saving it.
   */
  app.post(
    '/validate',
    { schema: { body: z.object({ graph: WorkflowGraphSchema }) } },
    async (request) => {
      const errors = validateGraph(request.body.graph);
      return { valid: errors.length === 0, errors };
    }
  );

  /**
   * GET /workflows
   * List workflows with their latest run status.
   */
  app.get('/', async () => {
    const { workflows, runs } = getWorkflowRepos();
    const all = await workflows.find({ order: { updatedAt: 'DESC' } });

    const summaries = await Promise.all(
      all.map(async (wf) => {
        const lastRun = await runs.findOne({
          where: { workflowId: wf.id },
          order: { startedAt: 'DESC' },
        });
        return {
          id: wf.id,
          name: wf.name,
          description: wf.description,
          enabled: wf.enabled,
          cron: wf.cron,
          nextRunAt: wf.nextRunAt,
          nodeCount: wf.graph.nodes.length,
          updatedAt: wf.updatedAt,
          lastRun: lastRun
            ? {
                id: lastRun.id,
                status: lastRun.status,
                startedAt: lastRun.startedAt,
                finishedAt: lastRun.finishedAt,
              }
            : null,
        };
      })
    );

    return { count: summaries.length, workflows: summaries };
  });

  /**
   * POST /workflows
   * Create a workflow (graph must validate).
   */
  app.post(
    '/',
    { schema: { body: WorkflowBodySchema } },
    async (request, reply) => {
      const errors = validateGraph(request.body.graph);
      if (errors.length > 0) {
        return reply.status(422).send({ error: 'Invalid graph', errors });
      }

      const { workflows } = getWorkflowRepos();
      const enabled = request.body.enabled ?? true;
      const cron = request.body.cron ?? null;
      const workflow = await workflows.save(
        workflows.create({
          name: request.body.name,
          description: request.body.description ?? null,
          graph: request.body.graph,
          settings: request.body.settings ?? {},
          enabled,
          cron,
          nextRunAt: computeNextRunAt(cron, enabled),
        })
      );

      return reply.status(201).send({ success: true, workflow });
    }
  );

  /**
   * GET /workflows/:id
   */
  app.get(
    '/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const { workflows } = getWorkflowRepos();
      const workflow = await workflows.findOneBy({ id: request.params.id });
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }
      return workflow;
    }
  );

  /**
   * PUT /workflows/:id
   */
  app.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: WorkflowBodySchema.partial(),
      },
    },
    async (request, reply) => {
      const { workflows } = getWorkflowRepos();
      const workflow = await workflows.findOneBy({ id: request.params.id });
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      if (request.body.graph) {
        const errors = validateGraph(request.body.graph);
        if (errors.length > 0) {
          return reply.status(422).send({ error: 'Invalid graph', errors });
        }
        workflow.graph = request.body.graph;
      }
      if (request.body.name !== undefined) workflow.name = request.body.name;
      if (request.body.description !== undefined)
        workflow.description = request.body.description ?? null;
      if (request.body.settings !== undefined)
        workflow.settings = request.body.settings;
      if (request.body.enabled !== undefined)
        workflow.enabled = request.body.enabled;
      if (request.body.cron !== undefined) workflow.cron = request.body.cron;

      // Any change to cron/enabled reshapes the schedule
      workflow.nextRunAt = computeNextRunAt(workflow.cron, workflow.enabled);

      await workflows.save(workflow);
      return { success: true, workflow };
    }
  );

  /**
   * DELETE /workflows/:id
   * Removes the workflow and (via FK cascade) its run history.
   */
  app.delete(
    '/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const { workflows } = getWorkflowRepos();
      const result = await workflows.delete({ id: request.params.id });
      if (!result.affected) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }
      return { success: true };
    }
  );

  /**
   * POST /workflows/:id/run
   * Start a run in the background; returns the run id immediately.
   */
  app.post(
    '/:id/run',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({ input: z.unknown().optional() })
          .optional()
          .default({}),
      },
    },
    async (request, reply) => {
      const { workflows } = getWorkflowRepos();
      const workflow = await workflows.findOneBy({ id: request.params.id });
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }
      if (!workflow.enabled) {
        return reply.status(409).send({ error: 'Workflow is disabled' });
      }

      // Re-validate at run time: the registry may have changed since save
      // (e.g. an MCP server was disconnected)
      const errors = validateGraph(workflow.graph);
      if (errors.length > 0) {
        return reply
          .status(422)
          .send({ error: 'Workflow graph is no longer valid', errors });
      }

      const runId = await getWorkflowEngine().startRun(
        workflow,
        request.body?.input,
        'manual'
      );

      return reply.status(202).send({ success: true, runId });
    }
  );

  /**
   * GET /workflows/:id/runs
   * Run history for a workflow.
   */
  app.get(
    '/:id/runs',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
      },
    },
    async (request) => {
      const { runs } = getWorkflowRepos();
      const items = await runs.find({
        where: { workflowId: request.params.id },
        order: { startedAt: 'DESC' },
        take: request.query.limit,
      });
      return {
        count: items.length,
        runs: items.map((r) => ({
          id: r.id,
          status: r.status,
          trigger: r.trigger,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          error: r.error,
        })),
      };
    }
  );

  /**
   * GET /workflows/runs/:runId
   * Full run detail including per-step logs.
   */
  app.get(
    '/runs/:runId',
    { schema: { params: z.object({ runId: z.string().uuid() }) } },
    async (request, reply) => {
      const { runs, stepRuns } = getWorkflowRepos();
      const run = await runs.findOneBy({ id: request.params.runId });
      if (!run) {
        return reply.status(404).send({ error: 'Run not found' });
      }
      const steps = await stepRuns.find({
        where: { runId: run.id },
        order: { sequence: 'ASC' },
      });
      return {
        ...run,
        active: getWorkflowEngine().isActive(run.id),
        steps,
      };
    }
  );

  /**
   * POST /workflows/runs/:runId/cancel
   */
  app.post(
    '/runs/:runId/cancel',
    { schema: { params: z.object({ runId: z.string().uuid() }) } },
    async (request, reply) => {
      const cancelled = getWorkflowEngine().cancel(request.params.runId);
      if (!cancelled) {
        return reply
          .status(404)
          .send({ error: 'Run is not active (already finished or unknown)' });
      }
      return { success: true, message: 'Cancellation requested' };
    }
  );
};
