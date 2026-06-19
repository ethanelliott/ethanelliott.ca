import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseSchema,
  ExpenseSchema,
  UpdateExpenseSchema,
} from './expense.types';

const TripParams = z.object({ id: z.string().uuid() });
const ExpenseParams = z.object({
  id: z.string().uuid(),
  expenseId: z.string().uuid(),
});
const SuccessSchema = z.object({ success: z.boolean() });

export async function ExpenseRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  fastify.addHook('preHandler', fastify.authenticate());

  const _expenses = inject(ExpensesService);

  typedFastify.get(
    '/trips/:id/expenses',
    {
      schema: {
        tags: ['Budget'],
        description: 'List the budget items of a trip',
        params: TripParams,
        response: { 200: z.array(ExpenseSchema) },
      },
    },
    async (request, reply) =>
      reply.send(await _expenses.list(request.params.id, request.currentUser.id))
  );

  typedFastify.post(
    '/trips/:id/expenses',
    {
      schema: {
        tags: ['Budget'],
        description: 'Add a budget item',
        params: TripParams,
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

  typedFastify.put(
    '/trips/:id/expenses/:expenseId',
    {
      schema: {
        tags: ['Budget'],
        description: 'Update a budget item',
        params: ExpenseParams,
        body: UpdateExpenseSchema,
        response: { 200: ExpenseSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _expenses.update(
          request.params.id,
          request.params.expenseId,
          request.currentUser.id,
          request.body
        )
      )
  );

  typedFastify.delete(
    '/trips/:id/expenses/:expenseId',
    {
      schema: {
        tags: ['Budget'],
        description: 'Delete a budget item',
        params: ExpenseParams,
        response: { 200: SuccessSchema },
      },
    },
    async (request, reply) =>
      reply.send(
        await _expenses.remove(
          request.params.id,
          request.params.expenseId,
          request.currentUser.id
        )
      )
  );
}
