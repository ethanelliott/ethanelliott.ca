import cron, { ScheduledTask } from 'node-cron';
import { runConsolidationCycle, ConsolidationOptions } from './consolidation.service.js';

export interface ScheduleConfig {
  cron: string;
  agent_id?: string;
  options?: ConsolidationOptions;
  enabled?: boolean;
}

export interface ScheduleEntry {
  id: string;
  cron: string;
  agent_id: string;
  options: ConsolidationOptions;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  task?: ScheduledTask;
}

const _schedules = new Map<string, ScheduleEntry>();
let _nextId = 1;

export function addSchedule(config: ScheduleConfig): ScheduleEntry {
  if (!cron.validate(config.cron)) {
    throw new Error(`Invalid cron expression: ${config.cron}`);
  }

  const id = String(_nextId++);
  const agentId = config.agent_id ?? 'default';
  const options = config.options ?? {};
  const enabled = config.enabled !== false;

  const entry: ScheduleEntry = { id, cron: config.cron, agent_id: agentId, options, enabled };

  if (enabled) {
    entry.task = cron.schedule(config.cron, () => runScheduled(entry), { timezone: 'UTC' });
    entry.next_run = nextRunAt(config.cron);
  }

  _schedules.set(id, entry);
  return sanitize(entry);
}

export function removeSchedule(id: string): boolean {
  const entry = _schedules.get(id);
  if (!entry) return false;
  entry.task?.stop();
  _schedules.delete(id);
  return true;
}

export function listSchedules(): ScheduleEntry[] {
  return Array.from(_schedules.values()).map(sanitize);
}

export function getSchedule(id: string): ScheduleEntry | undefined {
  const e = _schedules.get(id);
  return e ? sanitize(e) : undefined;
}

export function pauseSchedule(id: string): boolean {
  const entry = _schedules.get(id);
  if (!entry) return false;
  entry.task?.stop();
  entry.enabled = false;
  entry.next_run = undefined;
  return true;
}

export function resumeSchedule(id: string): boolean {
  const entry = _schedules.get(id);
  if (!entry) return false;
  if (!entry.task) {
    entry.task = cron.schedule(entry.cron, () => runScheduled(entry), { timezone: 'UTC' });
  } else {
    entry.task.start();
  }
  entry.enabled = true;
  entry.next_run = nextRunAt(entry.cron);
  return true;
}

// Seed a default nightly consolidation schedule on startup if env var is set.
// BRAIN_CONSOLIDATION_CRON defaults to '0 3 * * *' (03:00 UTC daily).
export function initDefaultSchedule(): void {
  const expr = process.env['BRAIN_CONSOLIDATION_CRON'];
  if (!expr) return;

  try {
    addSchedule({ cron: expr, agent_id: process.env['BRAIN_DEFAULT_AGENT'] ?? 'default' });
    console.info(`[scheduler] consolidation scheduled: ${expr}`);
  } catch (err) {
    console.warn(`[scheduler] invalid BRAIN_CONSOLIDATION_CRON: ${(err as Error).message}`);
  }
}

async function runScheduled(entry: ScheduleEntry): Promise<void> {
  entry.last_run = new Date().toISOString();
  entry.next_run = nextRunAt(entry.cron);

  try {
    const report = await runConsolidationCycle(entry.agent_id, entry.options);
    console.info(`[scheduler] consolidation complete agent=${entry.agent_id} duration=${report.total_duration_ms}ms`);
  } catch (err) {
    console.error(`[scheduler] consolidation failed agent=${entry.agent_id}:`, (err as Error).message);
  }
}

function sanitize(e: ScheduleEntry): ScheduleEntry {
  const { task: _task, ...rest } = e;
  return rest as ScheduleEntry;
}

// Best-effort next-run approximation: just note the expression since computing
// the next exact time requires a cron parser — enough for status display.
function nextRunAt(expr: string): string {
  return `next occurrence of '${expr}' (UTC)`;
}
