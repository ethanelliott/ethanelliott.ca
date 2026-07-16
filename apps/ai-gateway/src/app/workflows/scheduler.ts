import { CronExpressionParser } from 'cron-parser';
import { IsNull, Not, LessThanOrEqual } from 'typeorm';
import { getWorkflowRepos, isWorkflowDbAvailable } from './db';
import { getWorkflowEngine, validateGraph } from './engine';

const DEFAULT_TICK_MS = 30_000;

/**
 * Parse a cron expression (5-field, UTC) and return the next occurrence
 * after the given date. Throws on invalid expressions.
 */
export function nextCronOccurrence(cron: string, after: Date = new Date()): Date {
  const expression = CronExpressionParser.parse(cron, {
    currentDate: after,
    tz: 'UTC',
  });
  return expression.next().toDate();
}

/** Validate a cron expression without computing anything. */
export function isValidCron(cron: string): boolean {
  try {
    CronExpressionParser.parse(cron, { tz: 'UTC' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Workflow Scheduler
 *
 * Fires cron-scheduled workflows. Safe with multiple gateway replicas
 * sharing one Postgres: each due workflow is claimed with an optimistic
 * UPDATE that advances `nextRunAt` — under READ COMMITTED, concurrent
 * claims re-evaluate the WHERE clause after the winner commits and match
 * zero rows, so exactly one replica starts the run.
 *
 * Catch-up policy: a `nextRunAt` in the past fires once (e.g. after the
 * gateway was down over a scheduled time), then advances to the next
 * future occurrence — missed intermediate firings are not replayed.
 */
export class WorkflowScheduler {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  start(intervalMs: number = DEFAULT_TICK_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Immediate pass on boot picks up anything missed while down
    void this.tick();
    console.log(
      `[Workflows] Scheduler started (tick every ${intervalMs / 1000}s)`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One scheduler pass: claim and fire every due workflow.
   * Public so tests can drive it deterministically.
   * @returns run ids started by this pass
   */
  async tick(): Promise<string[]> {
    if (this.ticking || !isWorkflowDbAvailable()) return [];
    this.ticking = true;
    const started: string[] = [];

    try {
      const { workflows } = getWorkflowRepos();
      const due = await workflows.find({
        where: {
          enabled: true,
          cron: Not(IsNull()),
          nextRunAt: LessThanOrEqual(new Date()),
        },
        take: 20,
      });

      for (const workflow of due) {
        try {
          const next = nextCronOccurrence(workflow.cron!);

          // Optimistic claim: only one replica's UPDATE matches
          const claim = await workflows
            .createQueryBuilder()
            .update()
            .set({ nextRunAt: next })
            .where('id = :id AND "nextRunAt" = :seen', {
              id: workflow.id,
              seen: workflow.nextRunAt,
            })
            .execute();

          if (!claim.affected) continue; // another replica won this firing

          const engine = getWorkflowEngine();
          if (engine.isWorkflowActive(workflow.id)) {
            console.log(
              `[Workflows] Skipping scheduled run of "${workflow.name}" — previous run still active`
            );
            continue;
          }

          // The registry may have changed since the workflow was saved
          const errors = validateGraph(workflow.graph);
          if (errors.length > 0) {
            console.warn(
              `[Workflows] Scheduled workflow "${workflow.name}" is no longer valid: ${errors
                .map((e) => e.message)
                .join('; ')}`
            );
            continue;
          }

          const runId = await engine.startRun(
            workflow,
            { scheduledFor: workflow.nextRunAt?.toISOString() },
            'cron'
          );
          started.push(runId);
          console.log(
            `[Workflows] Cron fired "${workflow.name}" (run ${runId}), next at ${next.toISOString()}`
          );
        } catch (error) {
          console.error(
            `[Workflows] Scheduler failed to fire "${workflow.name}":`,
            error
          );
        }
      }
    } catch (error) {
      console.error('[Workflows] Scheduler tick failed:', error);
    } finally {
      this.ticking = false;
    }

    return started;
  }
}

const scheduler = new WorkflowScheduler();

export function getWorkflowScheduler(): WorkflowScheduler {
  return scheduler;
}
