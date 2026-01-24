import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PlaidService } from './plaid.service';
import { PlaidItemOutSchema, PlaidItemStatus } from './plaid-item.entity';
import { SyncLogOutSchema, SyncType } from './sync-log.entity';

export async function PlaidRouter(fastify: FastifyInstance) {
  const plaidService = inject(PlaidService);

  // Check if Plaid is configured
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/status',
    {
      schema: {
        response: {
          200: z.object({
            configured: z.boolean(),
            environment: z.string(),
          }),
        },
      },
    },
    async (request) => {
      return {
        configured: plaidService.isConfigured(),
        environment: process.env.PLAID_ENV || 'production',
      };
    }
  );

  // Create link token to initialize Plaid Link
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/link-token',
    {
      schema: {
        response: {
          200: z.object({
            linkToken: z.string(),
            expiration: z.string(),
          }),
        },
      },
    },
    async (request) => {
      return plaidService.createLinkToken(request.currentUser.id);
    }
  );

  // Create update link token (for re-authentication)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/link-token/:itemId',
    {
      schema: {
        params: z.object({
          itemId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            linkToken: z.string(),
            expiration: z.string(),
          }),
        },
      },
    },
    async (request) => {
      return plaidService.createUpdateLinkToken(
        request.currentUser.id,
        request.params.itemId
      );
    }
  );

  // Exchange public token after Plaid Link completes
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/exchange-token',
    {
      schema: {
        body: z.object({
          publicToken: z.string(),
          institutionId: z.string().optional(),
          institutionName: z.string().optional(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            item: PlaidItemOutSchema,
          }),
        },
      },
    },
    async (request) => {
      const item = await plaidService.exchangeToken(
        request.currentUser.id,
        request.body.publicToken,
        request.body.institutionId,
        request.body.institutionName
      );

      return {
        success: true,
        item: {
          id: item.id,
          itemId: item.itemId,
          institutionId: item.institutionId || null,
          institutionName: item.institutionName || null,
          institutionLogo: item.institutionLogo || null,
          institutionColor: item.institutionColor || null,
          status: item.status,
          lastSyncAt: item.lastSyncAt || null,
          lastError: item.lastError || null,
          consentExpiresAt: item.consentExpiresAt || null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      };
    }
  );

  // Get all connected items (banks)
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/items',
    {
      schema: {
        response: {
          200: z.array(PlaidItemOutSchema),
        },
      },
    },
    async (request) => {
      const items = await plaidService.getItems(request.currentUser.id);
      return items.map((item) => ({
        id: item.id,
        itemId: item.itemId,
        institutionId: item.institutionId || null,
        institutionName: item.institutionName || null,
        institutionLogo: item.institutionLogo || null,
        institutionColor: item.institutionColor || null,
        status: item.status,
        lastSyncAt: item.lastSyncAt || null,
        lastError: item.lastError || null,
        consentExpiresAt: item.consentExpiresAt || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    }
  );

  // Get a specific item
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/items/:itemId',
    {
      schema: {
        params: z.object({
          itemId: z.string().uuid(),
        }),
        response: {
          200: PlaidItemOutSchema,
        },
      },
    },
    async (request, reply) => {
      const item = await plaidService.getItem(
        request.params.itemId,
        request.currentUser.id
      );

      if (!item) {
        return reply.notFound('Item not found');
      }

      return {
        id: item.id,
        itemId: item.itemId,
        institutionId: item.institutionId || null,
        institutionName: item.institutionName || null,
        institutionLogo: item.institutionLogo || null,
        institutionColor: item.institutionColor || null,
        status: item.status,
        lastSyncAt: item.lastSyncAt || null,
        lastError: item.lastError || null,
        consentExpiresAt: item.consentExpiresAt || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    }
  );

  // Remove an item (disconnect bank)
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/items/:itemId',
    {
      schema: {
        params: z.object({
          itemId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      await plaidService.removeItem(
        request.params.itemId,
        request.currentUser.id
      );
      return { success: true };
    }
  );

  // Sync transactions for a specific item
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/items/:itemId/sync',
    {
      schema: {
        params: z.object({
          itemId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            added: z.number(),
            modified: z.number(),
            removed: z.number(),
            accountsUpdated: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const result = await plaidService.syncTransactions(
        request.params.itemId,
        request.currentUser.id,
        SyncType.MANUAL
      );
      return {
        added: result.added,
        modified: result.modified,
        removed: result.removed,
        accountsUpdated: result.accountsUpdated,
      };
    }
  );

  // Sync all items
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/sync-all',
    {
      schema: {
        response: {
          200: z.object({
            success: z.boolean(),
            results: z.record(
              z.string(),
              z.object({
                added: z.number(),
                modified: z.number(),
                removed: z.number(),
                accountsUpdated: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (request) => {
      const results = await plaidService.syncAllItems(request.currentUser.id);
      const resultsObj: Record<
        string,
        {
          added: number;
          modified: number;
          removed: number;
          accountsUpdated: number;
        }
      > = {};

      results.forEach((value, key) => {
        resultsObj[key] = {
          added: value.added,
          modified: value.modified,
          removed: value.removed,
          accountsUpdated: value.accountsUpdated,
        };
      });

      return { success: true, results: resultsObj };
    }
  );

  // Get sync logs
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/sync-logs',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().min(1).max(100).default(20),
        }),
        response: {
          200: z.array(SyncLogOutSchema),
        },
      },
    },
    async (request) => {
      const logs = await plaidService.getSyncLogs(
        request.currentUser.id,
        request.query.limit
      );
      return logs.map((log) => ({
        id: log.id,
        plaidItemId: log.plaidItem?.id || '',
        institutionName: log.plaidItem?.institutionName || null,
        syncType: log.syncType,
        status: log.status,
        transactionsAdded: log.transactionsAdded,
        transactionsModified: log.transactionsModified,
        transactionsRemoved: log.transactionsRemoved,
        accountsUpdated: log.accountsUpdated,
        error: log.error || null,
        durationMs: log.durationMs || null,
        createdAt: log.createdAt,
      }));
    }
  );
}
