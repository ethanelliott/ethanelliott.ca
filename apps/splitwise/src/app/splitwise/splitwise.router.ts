import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ExpensesService } from './expenses.service';
import { GroupsService } from './groups.service';
import { OverviewService } from './overview.service';
import { SettlementsService } from './settlements.service';
import {
  ActivityItemSchema,
  AddMemberSchema,
  CreateExpenseSchema,
  CreateGroupSchema,
  CreateSettlementSchema,
  ExpenseSchema,
  GroupBalancesSchema,
  GroupSchema,
  GroupSummarySchema,
  OverviewSchema,
  SettlementSchema,
  UpdateGroupSchema,
} from './splitwise.types';

const IdParams = z.object({ id: z.string().uuid() });
const SuccessSchema = z.object({ success: z.boolean() });

export async function SplitwiseRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Every route in this module requires authentication.
  fastify.addHook('preHandler', fastify.authenticate());

  const _groups = inject(GroupsService);
  const _expenses = inject(ExpensesService);
  const _settlements = inject(SettlementsService);
  const _overview = inject(OverviewService);

  // ── Overview & activity ──────────────────────────────────────
  typedFastify.get(
    '/overview',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Aggregate balances across all of your groups',
        response: { 200: OverviewSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _overview.forUser(request.currentUser.id))
  );

  typedFastify.get(
    '/activity',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Recent expenses across all of your groups',
        response: { 200: z.array(ActivityItemSchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _expenses.activityForUser(request.currentUser.id))
  );

  // ── Groups ───────────────────────────────────────────────────
  typedFastify.get(
    '/groups',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'List groups you belong to',
        response: { 200: z.array(GroupSummarySchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _groups.listForUser(request.currentUser.id))
  );

  typedFastify.post(
    '/groups',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Create a new group',
        body: CreateGroupSchema,
        response: { 201: GroupSchema },
      },
    },
    async (request, reply) => {
      const group = await _groups.create(request.currentUser.id, request.body);
      return reply.code(201).send(group);
    }
  );

  typedFastify.get(
    '/groups/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Get a single group',
        params: IdParams,
        response: { 200: GroupSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _groups.getById(request.params.id, request.currentUser.id))
  );

  typedFastify.put(
    '/groups/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Update a group',
        params: IdParams,
        body: UpdateGroupSchema,
        response: { 200: GroupSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _groups.update(
          request.params.id,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/groups/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Delete a group',
        params: IdParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _groups.remove(request.params.id, request.currentUser.id))
  );

  typedFastify.get(
    '/groups/:id/balances',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Get member balances and simplified debts for a group',
        params: IdParams,
        response: { 200: GroupBalancesSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _groups.getBalances(request.params.id, request.currentUser.id)
      )
  );

  // ── Members ──────────────────────────────────────────────────
  typedFastify.post(
    '/groups/:id/members',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Add a member to a group by username',
        params: IdParams,
        body: AddMemberSchema,
        response: { 200: GroupSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _groups.addMember(
          request.params.id,
          request.currentUser.id,
          request.body.username
        )
      )
  );

  typedFastify.delete(
    '/groups/:id/members/:userId',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Remove a member from a group',
        params: z.object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
        }),
        response: { 200: GroupSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _groups.removeMember(
          request.params.id,
          request.currentUser.id,
          request.params.userId
        )
      )
  );

  // ── Expenses ─────────────────────────────────────────────────
  typedFastify.get(
    '/groups/:id/expenses',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'List expenses in a group',
        params: IdParams,
        response: { 200: z.array(ExpenseSchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _expenses.list(request.params.id, request.currentUser.id))
  );

  typedFastify.post(
    '/groups/:id/expenses',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Add an expense to a group',
        params: IdParams,
        body: CreateExpenseSchema,
        response: { 201: ExpenseSchema },
      },
    },
    async (request, reply) => {
      const expense = await _expenses.create(
        request.params.id,
        request.currentUser.id,
        request.body
      );
      return reply.code(201).send(expense);
    }
  );

  typedFastify.get(
    '/expenses/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Get a single expense',
        params: IdParams,
        response: { 200: ExpenseSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _expenses.getById(request.params.id, request.currentUser.id))
  );

  typedFastify.put(
    '/expenses/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Update an expense',
        params: IdParams,
        body: CreateExpenseSchema,
        response: { 200: ExpenseSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _expenses.update(
          request.params.id,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/expenses/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Delete an expense',
        params: IdParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(await _expenses.remove(request.params.id, request.currentUser.id))
  );

  // ── Settlements ──────────────────────────────────────────────
  typedFastify.get(
    '/groups/:id/settlements',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'List settlements (payments) in a group',
        params: IdParams,
        response: { 200: z.array(SettlementSchema) },
      },
    },
    async (request, reply) =>
      reply.send(
        await _settlements.list(request.params.id, request.currentUser.id)
      )
  );

  typedFastify.post(
    '/groups/:id/settlements',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Record a settlement payment between two members',
        params: IdParams,
        body: CreateSettlementSchema,
        response: { 201: SettlementSchema },
      },
    },
    async (request, reply) => {
      const settlement = await _settlements.create(
        request.params.id,
        request.currentUser.id,
        request.body
      );
      return reply.code(201).send(settlement);
    }
  );

  typedFastify.delete(
    '/settlements/:id',
    {
      schema: {
        tags: ['Splitwise'],
        description: 'Delete a settlement',
        params: IdParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _settlements.remove(request.params.id, request.currentUser.id)
      )
  );
}
