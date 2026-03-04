import { inject } from '@ee/di';
import { z } from 'zod';
import { Database } from '../data-source';
import { Task, TaskState } from '../tasks/task.entity';

export const ProjectSummarySchema = z.object({
  project: z.string(),
  total: z.number(),
  byState: z.record(z.string(), z.number()),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export class ProjectsService {
  private readonly _tasks = inject(Database).repositoryFor(Task);

  async listProjects(): Promise<ProjectSummary[]> {
    // Get all distinct projects and their state counts
    const rows = await this._tasks
      .createQueryBuilder('task')
      .select('task.project', 'project')
      .addSelect('task.state', 'state')
      .addSelect('COUNT(*)', 'count')
      .where('task.deletedAt IS NULL')
      .groupBy('task.project')
      .addGroupBy('task.state')
      .getRawMany<{ project: string; state: string; count: string }>();

    // Aggregate by project
    const projectMap = new Map<string, ProjectSummary>();

    for (const row of rows) {
      if (!projectMap.has(row.project)) {
        projectMap.set(row.project, {
          project: row.project,
          total: 0,
          byState: {},
        });
      }
      const summary = projectMap.get(row.project)!;
      const count = parseInt(row.count, 10);
      summary.byState[row.state] = count;
      summary.total += count;
    }

    return Array.from(projectMap.values()).sort((a, b) =>
      a.project.localeCompare(b.project)
    );
  }
}
