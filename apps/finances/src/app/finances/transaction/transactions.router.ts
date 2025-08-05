import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TransactionIn,
  TransactionInSchema,
  TransactionOutSchema,
} from './transaction';
import { TransactionsService } from './transactions.service';
import HttpErrors from 'http-errors';

export async function TransactionsRouter(fastify: FastifyInstance) {
  const _transactionsService = inject(TransactionsService);

  fastify.get(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Transactions'],
        response: {
          200: z.array(TransactionOutSchema),
        },
      },
    },
    async function (request, reply) {
      const allTransactions = await _transactionsService.all();
      return reply.send(allTransactions);
    }
  );

  fastify.post(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Transactions'],
        body: TransactionInSchema,
        response: { 200: TransactionOutSchema },
      },
    },
    async function (request, reply) {
      const transaction = request.body as TransactionIn;
      const newTransaction = await _transactionsService.new(transaction);
      return reply.send(newTransaction);
    }
  );

  fastify.get(
    '/:id',
    {
      preHandler: fastify.circuitBreaker(),
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
      const { id } = request.params as { id: string };
      const transaction = await _transactionsService.findById(id);

      if (!transaction) {
        return reply.status(404).send({ message: 'Transaction not found' });
      }

      return reply.send(transaction);
    }
  );

  fastify.put(
    '/:id',
    {
      preHandler: fastify.circuitBreaker(),
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
      const { id } = request.params as { id: string };
      const transaction = request.body as TransactionIn;

      const updatedTransaction = await _transactionsService.update(
        id,
        transaction
      );

      if (!updatedTransaction) {
        throw new HttpErrors.NotFound(`Transaction with id "${id}" not found.`);
      }

      return reply.send(updatedTransaction);
    }
  );

  fastify.delete(
    '/:id',
    {
      preHandler: fastify.circuitBreaker(),
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
      const { id } = request.params as { id: string };
      const deleted = await _transactionsService.deleteById(id);

      if (!deleted) {
        throw new HttpErrors.NotFound(`Transaction with id "${id}" not found.`);
      }

      return reply.send({ success: true });
    }
  );

  fastify.delete(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
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
      const deletedCount = await _transactionsService.deleteAll();
      return reply.send({ success: true, deletedCount });
    }
  );
}
