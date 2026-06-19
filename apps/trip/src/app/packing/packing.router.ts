import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PackingService } from './packing.service';
import {
  ApplyTemplateSchema,
  CreateContainerSchema,
  CreateItemSchema,
  PackingListSchema,
  PackingTemplateSummarySchema,
  SaveTemplateSchema,
  UpdateContainerSchema,
  UpdateItemSchema,
} from './packing.types';

const TripParams = z.object({ id: z.string().uuid() });
const ContainerParams = z.object({
  id: z.string().uuid(),
  containerId: z.string().uuid(),
});
const ItemParams = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});
const TemplateParams = z.object({ templateId: z.string().uuid() });
const SuccessSchema = z.object({ success: z.boolean() });

export async function PackingRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  fastify.addHook('preHandler', fastify.authenticate());
  const _packing = inject(PackingService);

  // ── Current user's list for a trip ──
  typedFastify.get(
    '/trips/:id/packing',
    {
      schema: {
        tags: ['Packing'],
        description: "Get the current user's packing list for a trip",
        params: TripParams,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _packing.getList(request.params.id, request.currentUser.id))
  );

  // ── Containers ──
  typedFastify.post(
    '/trips/:id/packing/containers',
    {
      schema: {
        tags: ['Packing'],
        description: 'Add a container',
        params: TripParams,
        body: CreateContainerSchema,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.addContainer(
          request.params.id,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.put(
    '/trips/:id/packing/containers/:containerId',
    {
      schema: {
        tags: ['Packing'],
        description: 'Update a container',
        params: ContainerParams,
        body: UpdateContainerSchema,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.updateContainer(
          request.params.id,
          request.params.containerId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/packing/containers/:containerId',
    {
      schema: {
        tags: ['Packing'],
        description: 'Delete a container (items keep, become uncontained)',
        params: ContainerParams,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.removeContainer(
          request.params.id,
          request.params.containerId,
          request.currentUser.id
        )
      )
  );

  // ── Items ──
  typedFastify.post(
    '/trips/:id/packing/items',
    {
      schema: {
        tags: ['Packing'],
        description: 'Add a packing item',
        params: TripParams,
        body: CreateItemSchema,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.addItem(
          request.params.id,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.put(
    '/trips/:id/packing/items/:itemId',
    {
      schema: {
        tags: ['Packing'],
        description: 'Update a packing item (enforces ready→packed→verify)',
        params: ItemParams,
        body: UpdateItemSchema,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.updateItem(
          request.params.id,
          request.params.itemId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/packing/items/:itemId',
    {
      schema: {
        tags: ['Packing'],
        description: 'Delete a packing item',
        params: ItemParams,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.removeItem(
          request.params.id,
          request.params.itemId,
          request.currentUser.id
        )
      )
  );

  // ── Templates (per user) ──
  typedFastify.get(
    '/packing-templates',
    {
      schema: {
        tags: ['Packing'],
        description: 'List your saved packing templates',
        response: { 200: z.array(PackingTemplateSummarySchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _packing.listTemplates(request.currentUser.id))
  );

  typedFastify.post(
    '/trips/:id/packing/save-template',
    {
      schema: {
        tags: ['Packing'],
        description: "Save the current list as a reusable template",
        params: TripParams,
        body: SaveTemplateSchema,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.saveTemplate(
          request.params.id,
          request.currentUser.id,
          request.body.name
        )
      )
  );

  typedFastify.post(
    '/trips/:id/packing/apply-template',
    {
      schema: {
        tags: ['Packing'],
        description: 'Add a template’s containers and items into the list',
        params: TripParams,
        body: ApplyTemplateSchema,
        response: { 200: PackingListSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.applyTemplate(
          request.params.id,
          request.currentUser.id,
          request.body.templateId
        )
      )
  );

  typedFastify.delete(
    '/packing-templates/:templateId',
    {
      schema: {
        tags: ['Packing'],
        description: 'Delete a saved template',
        params: TemplateParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _packing.deleteTemplate(
          request.currentUser.id,
          request.params.templateId
        )
      )
  );
}
