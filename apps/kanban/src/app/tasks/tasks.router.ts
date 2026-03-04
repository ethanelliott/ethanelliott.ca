import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  TasksService,
  TaskListFiltersSchema,
  NextTaskBodySchema,
  BatchCreateSchema,
  HistoryResponseSchema,
} from './tasks.service';
import {
  TaskInSchema,
  TaskPatchSchema,
  TaskOutSchema,
  TaskStateSchema,
} from './task.entity';
import { TaskDependencyOutSchema } from './task-dependency.entity';
import {
  ActivityEntryOutSchema,
  ActivityCommentInSchema,
} from './activity-entry.entity';

export async function TasksRouter(fastify: FastifyInstance) {
  const tasksService = inject(TasksService);

  // POST /tasks/batch — must come before /:id routes to avoid route collision
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/batch',
    {
      schema: {
        body: BatchCreateSchema,
        response: { 201: z.array(TaskOutSchema) },
      },
    },
    async (req, reply) => {
      const result = await tasksService.batchCreate(req.body);
      reply.code(201);
      return result;
    }
  );

  // POST /tasks/next — must come before /:id routes
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/next',
    {
      schema: {
        body: NextTaskBodySchema,
        response: {
          200: TaskOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const task = await tasksService.nextTask(
        req.body.assignee,
        req.body.project
      );
      if (!task) {
        reply.code(404);
        return { message: 'No eligible tasks available' };
      }
      return task;
    }
  );

  // POST /tasks
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/',
    {
      schema: {
        body: TaskInSchema,
        response: { 201: TaskOutSchema },
      },
    },
    async (req, reply) => {
      const task = await tasksService.create(req.body);
      reply.code(201);
      return task;
    }
  );

  // GET /tasks
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: TaskListFiltersSchema,
        response: { 200: z.array(TaskOutSchema) },
      },
    },
    async (req) => tasksService.list(req.query)
  );

  // GET /tasks/:id
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: TaskOutSchema },
      },
    },
    async (req) => tasksService.getById(req.params.id)
  );

  // PATCH /tasks/:id
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: TaskPatchSchema,
        response: { 200: TaskOutSchema },
      },
    },
    async (req) => tasksService.patch(req.params.id, req.body)
  );

  // DELETE /tasks/:id
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.void() },
      },
    },
    async (req, reply) => {
      await tasksService.delete(req.params.id);
      reply.code(204);
    }
  );

  // POST /tasks/:id/transition
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/:id/transition',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ state: TaskStateSchema }),
        response: { 200: TaskOutSchema },
      },
    },
    async (req) => tasksService.transition(req.params.id, req.body.state)
  );

  // GET /tasks/:id/dependencies
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id/dependencies',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.array(TaskDependencyOutSchema) },
      },
    },
    async (req) => tasksService.listDependencies(req.params.id)
  );

  // POST /tasks/:id/dependencies
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/:id/dependencies',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ dependsOnId: z.string().uuid() }),
        response: { 201: TaskDependencyOutSchema },
      },
    },
    async (req, reply) => {
      const dep = await tasksService.addDependency(
        req.params.id,
        req.body.dependsOnId
      );
      reply.code(201);
      return dep;
    }
  );

  // DELETE /tasks/:id/dependencies/:dependsOnId
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/:id/dependencies/:dependsOnId',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
          dependsOnId: z.string().uuid(),
        }),
        response: { 204: z.void() },
      },
    },
    async (req, reply) => {
      await tasksService.removeDependency(
        req.params.id,
        req.params.dependsOnId
      );
      reply.code(204);
    }
  );

  // GET /tasks/:id/subtasks
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id/subtasks',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.array(TaskOutSchema) },
      },
    },
    async (req) => tasksService.listSubtasks(req.params.id)
  );

  // GET /tasks/:id/history
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id/history',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: HistoryResponseSchema },
      },
    },
    async (req) => tasksService.getHistory(req.params.id)
  );

  // GET /tasks/:id/activity
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id/activity',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.array(ActivityEntryOutSchema) },
      },
    },
    async (req) => tasksService.getActivity(req.params.id)
  );

  // POST /tasks/:id/activity
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/:id/activity',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: ActivityCommentInSchema,
        response: { 201: ActivityEntryOutSchema },
      },
    },
    async (req, reply) => {
      const entry = await tasksService.postComment(req.params.id, req.body);
      reply.code(201);
      return entry;
    }
  );
}
