import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ActivitiesService } from './activities.service';
import { LegendService } from './legend.service';
import { TagsService } from './tags.service';
import {
  ActivitySchema,
  CreateActivitySchema,
  CreateLegendCategorySchema,
  CreateTagSchema,
  LegendCategorySchema,
  TagSchema,
  UpdateActivitySchema,
  UpdateLegendCategorySchema,
  UpdateTagSchema,
} from './activity.types';

const TripParams = z.object({ id: z.string().uuid() });
const ActivityParams = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
});
const TagParams = z.object({
  id: z.string().uuid(),
  tagId: z.string().uuid(),
});
const LegendParams = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
});
const RangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const SuccessSchema = z.object({ success: z.boolean() });

export async function ActivityRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  fastify.addHook('preHandler', fastify.authenticate());

  const _activities = inject(ActivitiesService);
  const _tags = inject(TagsService);
  const _legend = inject(LegendService);

  // ── Tags ─────────────────────────────────────────────────────
  typedFastify.get(
    '/trips/:id/tags',
    {
      schema: {
        tags: ['Schedule'],
        description: 'List the tags of a trip',
        params: TripParams,
        response: { 200: z.array(TagSchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _tags.list(request.params.id, request.currentUser.id))
  );

  typedFastify.post(
    '/trips/:id/tags',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Create a tag',
        params: TripParams,
        body: CreateTagSchema,
        response: { 201: TagSchema },
      },
    },
    async (request, reply) => {
      const tag = await _tags.create(
        request.params.id,
        request.currentUser.id,
        request.body
      );
      return reply.code(201).send(tag);
    }
  );

  typedFastify.put(
    '/trips/:id/tags/:tagId',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Update a tag',
        params: TagParams,
        body: UpdateTagSchema,
        response: { 200: TagSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _tags.update(
          request.params.id,
          request.params.tagId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/tags/:tagId',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Delete a tag',
        params: TagParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _tags.remove(
          request.params.id,
          request.params.tagId,
          request.currentUser.id
        )
      )
  );

  // ── Legend categories ────────────────────────────────────────
  typedFastify.get(
    '/trips/:id/legend',
    {
      schema: {
        tags: ['Schedule'],
        description: 'List the legend categories of a trip',
        params: TripParams,
        response: { 200: z.array(LegendCategorySchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _legend.list(request.params.id, request.currentUser.id))
  );

  typedFastify.post(
    '/trips/:id/legend',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Create a legend category',
        params: TripParams,
        body: CreateLegendCategorySchema,
        response: { 201: LegendCategorySchema },
      },
    },
    async (request, reply) => {
      const category = await _legend.create(
        request.params.id,
        request.currentUser.id,
        request.body
      );
      return reply.code(201).send(category);
    }
  );

  typedFastify.put(
    '/trips/:id/legend/:categoryId',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Update a legend category',
        params: LegendParams,
        body: UpdateLegendCategorySchema,
        response: { 200: LegendCategorySchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _legend.update(
          request.params.id,
          request.params.categoryId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/legend/:categoryId',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Delete a legend category',
        params: LegendParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _legend.remove(
          request.params.id,
          request.params.categoryId,
          request.currentUser.id
        )
      )
  );

  // ── Activities ───────────────────────────────────────────────
  typedFastify.get(
    '/trips/:id/activities',
    {
      schema: {
        tags: ['Schedule'],
        description: 'List the activities of a trip (optionally by range)',
        params: TripParams,
        querystring: RangeQuery,
        response: { 200: z.array(ActivitySchema) },
      },
    },
    async (request, reply) =>
      reply.send(
        await _activities.list(
          request.params.id,
          request.currentUser.id,
          request.query
        )
      )
  );

  typedFastify.post(
    '/trips/:id/activities',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Create an activity',
        params: TripParams,
        body: CreateActivitySchema,
        response: { 201: ActivitySchema },
      },
    },
    async (request, reply) => {
      const activity = await _activities.create(
        request.params.id,
        request.currentUser.id,
        request.body
      );
      return reply.code(201).send(activity);
    }
  );

  typedFastify.put(
    '/trips/:id/activities/:activityId',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Update an activity',
        params: ActivityParams,
        body: UpdateActivitySchema,
        response: { 200: ActivitySchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _activities.update(
          request.params.id,
          request.params.activityId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/activities/:activityId',
    {
      schema: {
        tags: ['Schedule'],
        description: 'Delete an activity',
        params: ActivityParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _activities.remove(
          request.params.id,
          request.params.activityId,
          request.currentUser.id
        )
      )
  );
}
