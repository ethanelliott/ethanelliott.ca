import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AccountsService } from './accounts.service';
import {
  AccountOutSchema,
  AccountUpdateSchema,
  AccountType,
} from './account.entity';

export async function AccountsRouter(fastify: FastifyInstance) {
  const accountsService = inject(AccountsService);

  // Get all accounts
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          visibleOnly: z.coerce.boolean().default(false),
        }),
        response: {
          200: z.array(AccountOutSchema),
        },
      },
    },
    async (request) => {
      if (request.query.visibleOnly) {
        return accountsService.getVisible(request.currentUser.id);
      }
      return accountsService.getAll(request.currentUser.id);
    }
  );

  // Get accounts grouped by institution
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/by-institution',
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              institutionId: z.string().nullable(),
              institutionName: z.string(),
              institutionLogo: z.string().nullable(),
              institutionColor: z.string().nullable(),
              accounts: z.array(AccountOutSchema),
              totalBalance: z.number(),
            })
          ),
        },
      },
    },
    async (request) => {
      return accountsService.getByInstitution(request.currentUser.id);
    }
  );

  // Get account summary
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/summary',
    {
      schema: {
        response: {
          200: z.object({
            totalAccounts: z.number(),
            visibleAccounts: z.number(),
            totalBalance: z.number(),
            totalAvailable: z.number(),
            byType: z.record(
              z.string(),
              z.object({
                count: z.number(),
                balance: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (request) => {
      return accountsService.getSummary(request.currentUser.id);
    }
  );

  // Get a specific account
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:accountId',
    {
      schema: {
        params: z.object({
          accountId: z.string().uuid(),
        }),
        response: {
          200: AccountOutSchema,
        },
      },
    },
    async (request) => {
      return accountsService.getById(
        request.params.accountId,
        request.currentUser.id
      );
    }
  );

  // Update account (visibility)
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:accountId',
    {
      schema: {
        params: z.object({
          accountId: z.string().uuid(),
        }),
        body: AccountUpdateSchema,
        response: {
          200: AccountOutSchema,
        },
      },
    },
    async (request) => {
      return accountsService.update(
        request.params.accountId,
        request.body,
        request.currentUser.id
      );
    }
  );
}
