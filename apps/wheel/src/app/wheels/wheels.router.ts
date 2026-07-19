import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { WheelsService } from './wheels.service';
import {
  CreateWheelSchema,
  ShareWheelSchema,
  SuccessSchema,
  UpdateWheelSchema,
  WheelSchema,
  WheelSummarySchema,
} from './wheel.types';

const IdParams = z.object({ id: z.string().uuid() });
const ShareParams = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function WheelsRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Every route in this module requires authentication.
  fastify.addHook('preHandler', fastify.authenticate());

  const _wheels = inject(WheelsService);

  typedFastify.get(
    '/',
    {
      schema: {
        tags: ['Wheels'],
        description: 'List the wheels you have saved',
        response: { 200: z.array(WheelSummarySchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _wheels.listForUser(request.currentUser.id))
  );

  typedFastify.post(
    '/',
    {
      schema: {
        tags: ['Wheels'],
        description: 'Create a new wheel',
        body: CreateWheelSchema,
        response: { 201: WheelSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await _wheels.create(request.currentUser.id, request.body))
  );

  typedFastify.get(
    '/:id',
    {
      schema: {
        tags: ['Wheels'],
        description: 'Get a saved wheel with its items and tags',
        params: IdParams,
        response: { 200: WheelSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _wheels.getOne(request.currentUser.id, request.params.id)
      )
  );

  typedFastify.put(
    '/:id',
    {
      schema: {
        tags: ['Wheels'],
        description: 'Replace a wheel name, tags and items',
        params: IdParams,
        body: UpdateWheelSchema,
        response: { 200: WheelSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _wheels.replace(
          request.currentUser.id,
          request.params.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Wheels'],
        description: 'Delete a saved wheel',
        params: IdParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) => {
      await _wheels.remove(request.currentUser.id, request.params.id);
      return reply.send({ success: true });
    }
  );

  typedFastify.post(
    '/:id/shares',
    {
      schema: {
        tags: ['Wheels'],
        description:
          'Share a wheel with another user by username (grants edit access)',
        params: IdParams,
        body: ShareWheelSchema,
        response: { 200: WheelSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _wheels.addShare(
          request.currentUser.id,
          request.params.id,
          request.body.username
        )
      )
  );

  typedFastify.delete(
    '/:id/shares/:userId',
    {
      schema: {
        tags: ['Wheels'],
        description:
          "Remove a user's access to a shared wheel (owner removes anyone; a collaborator can remove themselves)",
        params: ShareParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) => {
      await _wheels.removeShare(
        request.currentUser.id,
        request.params.id,
        request.params.userId
      );
      return reply.send({ success: true });
    }
  );
}
