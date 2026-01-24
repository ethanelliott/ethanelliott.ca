import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OverviewService } from './overview.service';

export async function OverviewRouter(fastify: FastifyInstance) {
  const overviewService = inject(OverviewService);

  // Get dashboard summary
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/dashboard',
    {
      schema: {
        response: {
          200: z.object({
            netWorth: z.object({
              totalAssets: z.number(),
              totalLiabilities: z.number(),
              netWorth: z.number(),
              accountBreakdown: z.array(
                z.object({
                  accountId: z.string(),
                  accountName: z.string(),
                  institutionName: z.string().nullable(),
                  type: z.string(),
                  balance: z.number(),
                  isAsset: z.boolean(),
                })
              ),
            }),
            spending: z.object({
              totalIncome: z.number(),
              totalExpenses: z.number(),
              netCashFlow: z.number(),
              byCategory: z.array(
                z.object({
                  category: z.string(),
                  amount: z.number(),
                  count: z.number(),
                  percentage: z.number(),
                })
              ),
              byDay: z.array(
                z.object({
                  date: z.string(),
                  income: z.number(),
                  expenses: z.number(),
                })
              ),
            }),
            unreviewedCount: z.number(),
            pendingCount: z.number(),
            lastSyncAt: z.date().nullable(),
            connectedBanks: z.number(),
          }),
        },
      },
    },
    async (request) => {
      return overviewService.getDashboard(request.currentUser.id);
    }
  );

  // Get net worth
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/net-worth',
    {
      schema: {
        response: {
          200: z.object({
            totalAssets: z.number(),
            totalLiabilities: z.number(),
            netWorth: z.number(),
            accountBreakdown: z.array(
              z.object({
                accountId: z.string(),
                accountName: z.string(),
                institutionName: z.string().nullable(),
                type: z.string(),
                balance: z.number(),
                isAsset: z.boolean(),
              })
            ),
          }),
        },
      },
    },
    async (request) => {
      return overviewService.getNetWorth(request.currentUser.id);
    }
  );

  // Get spending summary
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/spending',
    {
      schema: {
        querystring: z.object({
          startDate: z.string(),
          endDate: z.string(),
        }),
        response: {
          200: z.object({
            totalIncome: z.number(),
            totalExpenses: z.number(),
            netCashFlow: z.number(),
            byCategory: z.array(
              z.object({
                category: z.string(),
                amount: z.number(),
                count: z.number(),
                percentage: z.number(),
              })
            ),
            byDay: z.array(
              z.object({
                date: z.string(),
                income: z.number(),
                expenses: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (request) => {
      return overviewService.getSpending(
        request.currentUser.id,
        request.query.startDate,
        request.query.endDate
      );
    }
  );

  // Get monthly trends
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/monthly-trends',
    {
      schema: {
        querystring: z.object({
          months: z.coerce.number().min(1).max(24).default(6),
        }),
        response: {
          200: z.array(
            z.object({
              month: z.string(),
              income: z.number(),
              expenses: z.number(),
              netCashFlow: z.number(),
            })
          ),
        },
      },
    },
    async (request) => {
      return overviewService.getMonthlyTrends(
        request.currentUser.id,
        request.query.months
      );
    }
  );
}
