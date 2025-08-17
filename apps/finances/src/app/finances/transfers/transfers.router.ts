import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Transfer, TransferInSchema, TransferOutSchema } from './transfer';
import { TransfersService } from './transfers.service';

export async function TransfersRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _transfersService = inject(TransfersService);

  typedFastify.get(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Get all transfers',
        response: { 200: z.array(TransferOutSchema) },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const allTransfers = await _transfersService.all(userId);
      return reply.send(allTransfers);
    }
  );

  typedFastify.post(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Create new transfer',
        body: TransferInSchema,
        response: { 200: TransferOutSchema },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const transfer = request.body;
      const newTransfer = await _transfersService.new(transfer, userId);
      return reply.send(newTransfer);
    }
  );

  typedFastify.delete(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Delete all transfers',
        response: {
          200: z.object({
            deletedCount: z.number(),
          }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const deleted = await _transfersService.deleteAll(userId);
      return reply.send(deleted);
    }
  );

  typedFastify.get(
    '/account/:accountId',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Get transfers for specific account',
        params: z.object({
          accountId: z.string().uuid(),
        }),
        response: { 200: z.array(TransferOutSchema) },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { accountId } = request.params;
      const transfers = await _transfersService.getTransfersByAccount(
        accountId,
        userId
      );
      return reply.send(transfers);
    }
  );

  typedFastify.get(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Get transfer by ID',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: TransferOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { id } = request.params;
      try {
        const transfer = await _transfersService.get(id, userId);
        return reply.send(transfer);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  typedFastify.put(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Update transfer',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: TransferInSchema,
        response: {
          200: TransferOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { id } = request.params;
      const transfer = request.body;

      try {
        const updatedTransfer = await _transfersService.update(
          id,
          transfer,
          userId
        );
        return reply.send(updatedTransfer);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  typedFastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transfers'],
        description: 'Delete transfer',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: z.object({ success: z.boolean() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { id } = request.params;

      const deleted = await _transfersService.deleteById(id, userId);

      if (!deleted) {
        return reply.status(404).send({ message: 'Transfer not found' });
      }

      return reply.send({ success: true });
    }
  );
}
