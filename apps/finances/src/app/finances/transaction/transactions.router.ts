import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import HttpErrors from 'http-errors';
import { z } from 'zod';
import { TransactionInSchema, TransactionOutSchema } from './transaction';
import { TransactionsService } from './transactions.service';

export async function TransactionsRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _transactionsService = inject(TransactionsService);

  typedFastify.get(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transactions'],
        description: 'Get all transactions',
        response: {
          200: z.array(TransactionOutSchema),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const allTransactions = await _transactionsService.all(userId);
      return reply.send(allTransactions);
    }
  );

  typedFastify.post(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transactions'],
        description: 'Create new transaction',
        body: TransactionInSchema,
        response: { 200: TransactionOutSchema },
      },
    },
    async function (request, reply) {
      // request.body is now automatically typed based on TransactionInSchema
      const userId = request.currentUser.id;
      const transaction = request.body;
      const newTransaction = await _transactionsService.new(
        transaction,
        userId
      );
      return reply.send(newTransaction);
    }
  );

  typedFastify.get(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transactions'],
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: TransactionOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      // request.params is now automatically typed
      const userId = request.currentUser.id;
      const { id } = request.params;
      const transaction = await _transactionsService.findById(id, userId);

      if (!transaction) {
        return reply.status(404).send({ message: 'Transaction not found' });
      }

      return reply.send(transaction);
    }
  );

  typedFastify.put(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transactions'],
        params: z.object({
          id: z.string().uuid(),
        }),
        body: TransactionInSchema,
        response: {
          200: TransactionOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      // Both request.params and request.body are automatically typed
      const userId = request.currentUser.id;
      const { id } = request.params;
      const transaction = request.body;

      const updatedTransaction = await _transactionsService.update(
        id,
        transaction,
        userId
      );

      if (!updatedTransaction) {
        throw new HttpErrors.NotFound(`Transaction with id "${id}" not found.`);
      }

      return reply.send(updatedTransaction);
    }
  );

  typedFastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transactions'],
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
      // request.params is now automatically typed
      const userId = request.currentUser.id;
      const { id } = request.params;
      const deleted = await _transactionsService.deleteById(id, userId);

      if (!deleted) {
        throw new HttpErrors.NotFound(`Transaction with id "${id}" not found.`);
      }

      return reply.send({ success: true });
    }
  );

  typedFastify.delete(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Transactions'],
        response: {
          200: z.object({
            success: z.boolean(),
            deletedCount: z.number(),
          }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const result = await _transactionsService.deleteAll(userId);
      return reply.send(result);
    }
  );
}
