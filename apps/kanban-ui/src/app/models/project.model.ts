import { TaskState } from './task.model';

/** Response from GET /projects */
export interface ProjectSummary {
  project: string;
  total: number;
  /** Maps TaskState string → count */
  byState: Partial<Record<TaskState, number>>;
}
