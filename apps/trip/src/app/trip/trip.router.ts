import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SegmentsService } from './segments.service';
import { TripsService } from './trips.service';
import {
  AddMemberSchema,
  CreateSegmentSchema,
  CreateTripSchema,
  ReorderSegmentsSchema,
  SegmentSchema,
  TripSchema,
  TripSummarySchema,
  UpdateSegmentSchema,
  UpdateTripSchema,
} from './trip.types';

const IdParams = z.object({ id: z.string().uuid() });
const TripSegmentParams = z.object({
  id: z.string().uuid(),
  segmentId: z.string().uuid(),
});
const SuccessSchema = z.object({ success: z.boolean() });

export async function TripRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Every route in this module requires authentication.
  fastify.addHook('preHandler', fastify.authenticate());

  const _trips = inject(TripsService);
  const _segments = inject(SegmentsService);

  // ── Trips ────────────────────────────────────────────────────
  typedFastify.get(
    '/trips',
    {
      schema: {
        tags: ['Trips'],
        description: 'List trips you belong to',
        response: { 200: z.array(TripSummarySchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _trips.listForUser(request.currentUser.id))
  );

  typedFastify.post(
    '/trips',
    {
      schema: {
        tags: ['Trips'],
        description: 'Create a new trip',
        body: CreateTripSchema,
        response: { 201: TripSchema },
      },
    },
    async (request, reply) => {
      const trip = await _trips.create(request.currentUser.id, request.body);
      return reply.code(201).send(trip);
    }
  );

  typedFastify.get(
    '/trips/:id',
    {
      schema: {
        tags: ['Trips'],
        description: 'Get a single trip with members and segments',
        params: IdParams,
        response: { 200: TripSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _trips.getById(request.params.id, request.currentUser.id))
  );

  typedFastify.put(
    '/trips/:id',
    {
      schema: {
        tags: ['Trips'],
        description: 'Update a trip',
        params: IdParams,
        body: UpdateTripSchema,
        response: { 200: TripSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _trips.update(
          request.params.id,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id',
    {
      schema: {
        tags: ['Trips'],
        description: 'Delete a trip (owner only)',
        params: IdParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _trips.remove(request.params.id, request.currentUser.id))
  );

  // ── Members ──────────────────────────────────────────────────
  typedFastify.post(
    '/trips/:id/members',
    {
      schema: {
        tags: ['Trips'],
        description: 'Add a member to a trip by username',
        params: IdParams,
        body: AddMemberSchema,
        response: { 200: TripSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _trips.addMember(
          request.params.id,
          request.currentUser.id,
          request.body.username
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/members/:userId',
    {
      schema: {
        tags: ['Trips'],
        description: 'Remove a member (owner only, or leave the trip yourself)',
        params: z.object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
        }),
        response: { 200: TripSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _trips.removeMember(
          request.params.id,
          request.currentUser.id,
          request.params.userId
        )
      )
  );

  // ── Segments ─────────────────────────────────────────────────
  typedFastify.get(
    '/trips/:id/segments',
    {
      schema: {
        tags: ['Trips'],
        description: 'List the segments (cities/stays) of a trip',
        params: IdParams,
        response: { 200: z.array(SegmentSchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _segments.list(request.params.id, request.currentUser.id))
  );

  typedFastify.post(
    '/trips/:id/segments',
    {
      schema: {
        tags: ['Trips'],
        description: 'Add a segment to a trip',
        params: IdParams,
        body: CreateSegmentSchema,
        response: { 201: SegmentSchema },
      },
    },
    async (request, reply) => {
      const segment = await _segments.create(
        request.params.id,
        request.currentUser.id,
        request.body
      );
      return reply.code(201).send(segment);
    }
  );

  typedFastify.put(
    '/trips/:id/segments/reorder',
    {
      schema: {
        tags: ['Trips'],
        description: 'Reorder the segments of a trip',
        params: IdParams,
        body: ReorderSegmentsSchema,
        response: { 200: z.array(SegmentSchema) },
      },
    },
    async (request, reply) =>
      reply.send(
        await _segments.reorder(
          request.params.id,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.put(
    '/trips/:id/segments/:segmentId',
    {
      schema: {
        tags: ['Trips'],
        description: 'Update a segment',
        params: TripSegmentParams,
        body: UpdateSegmentSchema,
        response: { 200: SegmentSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _segments.update(
          request.params.id,
          request.params.segmentId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/segments/:segmentId',
    {
      schema: {
        tags: ['Trips'],
        description: 'Delete a segment',
        params: TripSegmentParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _segments.remove(
          request.params.id,
          request.params.segmentId,
          request.currentUser.id
        )
      )
  );
}
