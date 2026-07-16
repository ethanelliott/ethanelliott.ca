import { DataSource, Repository } from 'typeorm';
// Ensure the driver is included in the bundle
import 'pg';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { WorkflowStepRunEntity } from './entities/workflow-step-run.entity';

export const WORKFLOW_ENTITIES = [
  WorkflowEntity,
  WorkflowRunEntity,
  WorkflowStepRunEntity,
];

/**
 * Workflow persistence — Postgres via TypeORM, following the same DB_* env
 * convention as the other apps in the cluster (see aranet/finances).
 *
 * Unlike those apps the gateway does NOT exit when the database is missing:
 * chat/tools/agents work fine without it, so a failed connection just
 * disables the workflows feature (the router answers 503).
 */

let dataSource: DataSource | null = null;
let available = false;
let initError: string | null = null;

export function buildWorkflowDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'ai_gateway',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'ai_gateway',
    synchronize: true,
    entities: WORKFLOW_ENTITIES,
  });
}

/**
 * Initialize workflow persistence. Pass a custom DataSource for tests
 * (e.g. pg-mem); it must already be configured with WORKFLOW_ENTITIES.
 */
export async function initializeWorkflowDb(
  customDataSource?: DataSource
): Promise<boolean> {
  // Already connected (e.g. a test injected its own DataSource) — keep it
  if (available && !customDataSource) return true;
  try {
    dataSource = customDataSource ?? buildWorkflowDataSource();
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    available = true;
    initError = null;
    console.log(
      `[Workflows] Database connected (${WORKFLOW_ENTITIES.map(
        (e) => e.name
      ).join(', ')})`
    );
    return true;
  } catch (error) {
    available = false;
    initError = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Workflows] Database unavailable — workflow features disabled: ${initError}`
    );
    return false;
  }
}

export function isWorkflowDbAvailable(): boolean {
  return available;
}

export function getWorkflowDbError(): string | null {
  return initError;
}

export interface WorkflowRepos {
  workflows: Repository<WorkflowEntity>;
  runs: Repository<WorkflowRunEntity>;
  stepRuns: Repository<WorkflowStepRunEntity>;
}

export function getWorkflowRepos(): WorkflowRepos {
  if (!dataSource || !available) {
    throw new Error('Workflow database is not available');
  }
  return {
    workflows: dataSource.getRepository(WorkflowEntity),
    runs: dataSource.getRepository(WorkflowRunEntity),
    stepRuns: dataSource.getRepository(WorkflowStepRunEntity),
  };
}
