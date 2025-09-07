import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AccountInSchema, AccountOutSchema } from './account';
import { AccountsService } from './accounts.service';

export async function AccountsRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _accountsService = inject(AccountsService);

  typedFastify.get(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Accounts'],
        description: 'Get all accounts',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(AccountOutSchema) },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const allAccounts = await _accountsService.all(userId);
      return reply.send(allAccounts);
    }
  );

  typedFastify.post(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Accounts'],
        description: 'Create new account',
        body: AccountInSchema,
        response: { 200: AccountOutSchema },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const account = request.body;
      const newAccount = await _accountsService.new(account, userId);
      return reply.send(newAccount);
    }
  );

  typedFastify.delete(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Accounts'],
        description: 'Delete all accounts',
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const deleted = await _accountsService.deleteAll(userId);
      return reply.send(deleted);
    }
  );

  typedFastify.get(
    '/summary',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Accounts'],
        description: 'Get account summary',
        response: {
          200: z.object({
            totalAccounts: z.number(),
            totalBalance: z.number(),
          }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const summary = await _accountsService.getUserAccountSummary(userId);
      return reply.send(summary);
    }
  );

  typedFastify.get(
    '/:id',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Accounts'],
        description: 'Get account by ID',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: AccountOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { id } = request.params;
      try {
        const account = await _accountsService.get(id, userId);
        return reply.send(account);
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
        tags: ['Accounts'],
        description: 'Update account',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: AccountInSchema,
        response: {
          200: AccountOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { id } = request.params;
      const account = request.body;

      try {
        const updatedAccount = await _accountsService.update(
          id,
          account,
          userId
        );
        return reply.send(updatedAccount);
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
        tags: ['Accounts'],
        description: 'Delete account',
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

      try {
        const result = await _accountsService.delete(id, userId);
        return reply.send(result);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );
}
