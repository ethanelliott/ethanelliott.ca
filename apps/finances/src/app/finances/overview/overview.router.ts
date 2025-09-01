import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OverviewService } from './overview.service';

// Zod schemas for responses
const AccountBalanceSchema = z.object({
  accountId: z.string().uuid(),
  accountName: z.string(),
  initialBalance: z.number(),
  currentBalance: z.number(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  transfersIn: z.number(),
  transfersOut: z.number(),
});

const CategoryInsightSchema = z.object({
  category: z.string(),
  totalSpent: z.number(),
  transactionCount: z.number(),
  averageTransaction: z.number(),
  monthlyTrend: z.enum(['increasing', 'decreasing', 'stable']),
  percentOfTotalExpenses: z.number(),
});

const MonthlyBreakdownSchema = z.object({
  month: z.string(),
  year: z.number(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netCashFlow: z.number(),
  transferVolume: z.number(),
  transactionCount: z.number(),
  transferCount: z.number(),
  netWorthChange: z.number(),
});

const AllTimeOverviewSchema = z.object({
  currentNetWorth: z.number(),
  totalAccountBalance: z.number(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netCashFlow: z.number(),
  totalTransferVolume: z.number(),
  accountCount: z.number(),
  accountBalances: z.array(AccountBalanceSchema),
  transactionCount: z.number(),
  transferCount: z.number(),
  firstTransactionDate: z.string().nullable(),
  lastTransactionDate: z.string().nullable(),
  daysSinceFirstTransaction: z.number(),
  topExpenseCategories: z.array(CategoryInsightSchema),
  monthlyBreakdowns: z.array(MonthlyBreakdownSchema),
  averageMonthlyIncome: z.number(),
  averageMonthlyExpenses: z.number(),
  expenseToIncomeRatio: z.number(),
  savingsRate: z.number(),
});

const DailyBreakdownSchema = z.object({
  day: z.number(),
  income: z.number(),
  expenses: z.number(),
  transfers: z.number(),
});

const WeeklyBreakdownSchema = z.object({
  week: z.number(),
  income: z.number(),
  expenses: z.number(),
  transfers: z.number(),
});

const CategoryBreakdownSchema = z.object({
  category: z.string(),
  amount: z.number(),
  transactionCount: z.number(),
  percentOfTotal: z.number(),
});

const AccountActivitySchema = z.object({
  accountId: z.string().uuid(),
  accountName: z.string(),
  income: z.number(),
  expenses: z.number(),
  transfersIn: z.number(),
  transfersOut: z.number(),
  netChange: z.number(),
});

const MonthlyComparisonSchema = z.object({
  incomeChange: z.number(),
  expenseChange: z.number(),
  netCashFlowChange: z.number(),
  transactionCountChange: z.number(),
});

const MonthlyHabitsOverviewSchema = z.object({
  month: z.number(),
  year: z.number(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netCashFlow: z.number(),
  totalTransferVolume: z.number(),
  transfersIn: z.number(),
  transfersOut: z.number(),
  transactionCount: z.number(),
  transferCount: z.number(),
  averageTransactionSize: z.number(),
  dailyBreakdown: z.array(DailyBreakdownSchema),
  weeklyBreakdown: z.array(WeeklyBreakdownSchema),
  categoryBreakdown: z.array(CategoryBreakdownSchema),
  accountActivity: z.array(AccountActivitySchema),
  comparison: MonthlyComparisonSchema,
});

export async function OverviewRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _overviewService = inject(OverviewService);

  // All-time overview endpoint
  typedFastify.get(
    '/all-time',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Overview'],
        description: 'Get comprehensive all-time financial overview',
        response: {
          200: AllTimeOverviewSchema,
          500: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      try {
        const userId = request.currentUser.id;
        const overview = await _overviewService.getAllTimeOverview(userId);
        return reply.send(overview);
      } catch (error) {
        console.error('Error generating all-time overview:', error);
        return reply.status(500).send({
          message: 'Failed to generate all-time overview',
        });
      }
    }
  );

  // Monthly habits overview endpoint
  typedFastify.get(
    '/monthly/:year/:month',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Overview'],
        description: 'Get comprehensive monthly habits overview',
        params: z.object({
          year: z
            .string()
            .regex(/^\d{4}$/)
            .transform(Number),
          month: z
            .string()
            .regex(/^(0?[1-9]|1[0-2])$/)
            .transform((val) => Number(val) - 1), // Convert to 0-based month
        }),
        response: {
          200: MonthlyHabitsOverviewSchema,
          400: z.object({ message: z.string() }),
          500: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      try {
        const userId = request.currentUser.id;
        const { year, month } = request.params;

        // Validate month and year
        if (month < 0 || month > 11) {
          return reply.status(400).send({
            message: 'Invalid month. Must be between 1 and 12.',
          });
        }

        if (year < 1900 || year > new Date().getFullYear() + 1) {
          return reply.status(400).send({
            message: 'Invalid year.',
          });
        }

        const overview = await _overviewService.getMonthlyHabitsOverview(
          userId,
          month,
          year
        );
        return reply.send(overview);
      } catch (error) {
        console.error('Error generating monthly habits overview:', error);
        return reply.status(500).send({
          message: 'Failed to generate monthly habits overview',
        });
      }
    }
  );

  // Current month overview endpoint (convenience endpoint)
  typedFastify.get(
    '/monthly/current',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Overview'],
        description: 'Get comprehensive overview for current month',
        response: {
          200: MonthlyHabitsOverviewSchema,
          500: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      try {
        const userId = request.currentUser.id;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const overview = await _overviewService.getMonthlyHabitsOverview(
          userId,
          currentMonth,
          currentYear
        );
        return reply.send(overview);
      } catch (error) {
        console.error('Error generating current month overview:', error);
        return reply.status(500).send({
          message: 'Failed to generate current month overview',
        });
      }
    }
  );

  // Net worth endpoint for quick access
  typedFastify.get(
    '/net-worth',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Overview'],
        description: 'Get current net worth calculation',
        response: {
          200: z.object({
            currentNetWorth: z.number(),
            totalAccountBalance: z.number(),
            accountBalances: z.array(AccountBalanceSchema),
            lastUpdated: z.string(),
          }),
          500: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      try {
        const userId = request.currentUser.id;
        const overview = await _overviewService.getAllTimeOverview(userId);

        return reply.send({
          currentNetWorth: overview.currentNetWorth,
          totalAccountBalance: overview.totalAccountBalance,
          accountBalances: overview.accountBalances,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error calculating net worth:', error);
        return reply.status(500).send({
          message: 'Failed to calculate net worth',
        });
      }
    }
  );

  // Financial health score endpoint
  typedFastify.get(
    '/health-score',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Overview'],
        description: 'Get financial health score and metrics',
        response: {
          200: z.object({
            healthScore: z.number().min(0).max(100),
            savingsRate: z.number(),
            expenseToIncomeRatio: z.number(),
            averageMonthlyIncome: z.number(),
            averageMonthlyExpenses: z.number(),
            recommendations: z.array(z.string()),
          }),
          500: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      try {
        const userId = request.currentUser.id;
        const overview = await _overviewService.getAllTimeOverview(userId);

        // Calculate a health score based on financial metrics
        let healthScore = 50; // Base score

        // Savings rate impact (0-30 points)
        if (overview.savingsRate > 0.2) healthScore += 30;
        else if (overview.savingsRate > 0.1) healthScore += 20;
        else if (overview.savingsRate > 0.05) healthScore += 10;
        else if (overview.savingsRate < 0) healthScore -= 20;

        // Expense to income ratio impact (0-20 points)
        if (overview.expenseToIncomeRatio < 0.5) healthScore += 20;
        else if (overview.expenseToIncomeRatio < 0.8) healthScore += 10;
        else if (overview.expenseToIncomeRatio > 1) healthScore -= 30;

        // Net worth trend (0-20 points)
        if (overview.currentNetWorth > 0) healthScore += 20;
        else if (overview.currentNetWorth < -1000) healthScore -= 20;

        // Transaction count consistency (0-10 points)
        if (overview.transactionCount > overview.daysSinceFirstTransaction / 7)
          healthScore += 10;

        healthScore = Math.max(0, Math.min(100, healthScore));

        // Generate recommendations
        const recommendations: string[] = [];
        if (overview.savingsRate < 0.1) {
          recommendations.push(
            'Consider reducing expenses to increase your savings rate'
          );
        }
        if (overview.expenseToIncomeRatio > 0.9) {
          recommendations.push(
            'Your expenses are high relative to income - look for areas to cut back'
          );
        }
        if (overview.currentNetWorth < 0) {
          recommendations.push(
            'Focus on paying down debt to improve your net worth'
          );
        }
        if (overview.monthlyBreakdowns.length > 3) {
          const recentTrend = overview.monthlyBreakdowns.slice(-3);
          const avgRecent =
            recentTrend.reduce((sum, m) => sum + m.netCashFlow, 0) / 3;
          if (avgRecent < 0) {
            recommendations.push(
              'Recent months show negative cash flow - review your spending patterns'
            );
          }
        }

        return reply.send({
          healthScore,
          savingsRate: overview.savingsRate,
          expenseToIncomeRatio: overview.expenseToIncomeRatio,
          averageMonthlyIncome: overview.averageMonthlyIncome,
          averageMonthlyExpenses: overview.averageMonthlyExpenses,
          recommendations,
        });
      } catch (error) {
        console.error('Error calculating health score:', error);
        return reply.status(500).send({
          message: 'Failed to calculate financial health score',
        });
      }
    }
  );
}
