import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TransactionsService } from './transactions.service';
import {
  TransactionOutSchema,
  TransactionUpdateSchema,
  BulkReviewSchema,
  TransactionType,
} from './transaction.entity';

export async function TransactionsRouter(fastify: FastifyInstance) {
  const transactionsService = inject(TransactionsService);

  // Get all transactions with filters
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          accountId: z.string().uuid().optional(),
          categoryId: z.string().uuid().optional(),
          type: z.nativeEnum(TransactionType).optional(),
          isReviewed: z.coerce.boolean().optional(),
          isPending: z.coerce.boolean().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional(),
          hasLinkedTransfer: z.coerce.boolean().optional(),
        }),
        response: {
          200: z.array(TransactionOutSchema),
        },
      },
    },
    async (request) => {
      return transactionsService.getAll(request.currentUser.id, request.query);
    }
  );

  // Get unreviewed transactions (inbox)
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/inbox',
    {
      schema: {
        response: {
          200: z.array(TransactionOutSchema),
        },
      },
    },
    async (request) => {
      return transactionsService.getUnreviewed(request.currentUser.id);
    }
  );

  // Get transaction statistics
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/stats',
    {
      schema: {
        querystring: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }),
        response: {
          200: z.object({
            totalTransactions: z.number(),
            unreviewedCount: z.number(),
            totalIncome: z.number(),
            totalExpenses: z.number(),
            totalTransfers: z.number(),
            byCategory: z.array(
              z.object({
                category: z.string(),
                amount: z.number(),
                count: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (request) => {
      return transactionsService.getStats(
        request.currentUser.id,
        request.query.startDate,
        request.query.endDate
      );
    }
  );

  // Get a specific transaction
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:transactionId',
    {
      schema: {
        params: z.object({
          transactionId: z.string().uuid(),
        }),
        response: {
          200: TransactionOutSchema,
        },
      },
    },
    async (request) => {
      return transactionsService.getById(
        request.params.transactionId,
        request.currentUser.id
      );
    }
  );

  // Update a transaction
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:transactionId',
    {
      schema: {
        params: z.object({
          transactionId: z.string().uuid(),
        }),
        body: TransactionUpdateSchema,
        response: {
          200: TransactionOutSchema,
        },
      },
    },
    async (request) => {
      return transactionsService.update(
        request.params.transactionId,
        request.body,
        request.currentUser.id
      );
    }
  );

  // Mark transaction as reviewed
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/:transactionId/review',
    {
      schema: {
        params: z.object({
          transactionId: z.string().uuid(),
        }),
        response: {
          200: TransactionOutSchema,
        },
      },
    },
    async (request) => {
      return transactionsService.markReviewed(
        request.params.transactionId,
        request.currentUser.id
      );
    }
  );

  // Get linked transfer
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:transactionId/linked-transfer',
    {
      schema: {
        params: z.object({
          transactionId: z.string().uuid(),
        }),
        response: {
          200: TransactionOutSchema.nullable(),
        },
      },
    },
    async (request) => {
      return transactionsService.getLinkedTransfer(
        request.params.transactionId,
        request.currentUser.id
      );
    }
  );

  // Bulk operations
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/bulk/review',
    {
      schema: {
        body: BulkReviewSchema,
        response: {
          200: z.object({
            updated: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const updated = await transactionsService.bulkReview(
        request.body.transactionIds,
        {
          category: request.body.category,
          tags: request.body.tags,
        },
        request.currentUser.id
      );
      return { updated };
    }
  );

  // Mark multiple as reviewed
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/bulk/mark-reviewed',
    {
      schema: {
        body: z.object({
          transactionIds: z.array(z.string().uuid()),
        }),
        response: {
          200: z.object({
            updated: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const updated = await transactionsService.markMultipleReviewed(
        request.body.transactionIds,
        request.currentUser.id
      );
      return { updated };
    }
  );
}
