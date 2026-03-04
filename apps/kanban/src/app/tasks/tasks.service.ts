import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { IsNull, LessThan } from 'typeorm';
import { Database } from '../data-source';
import { canTransition, ASSIGNEE_CLEARING_STATES } from '../state-machine';
import { Task, TaskState, TaskIn, TaskPatch, TaskOut } from './task.entity';
import { TaskDependency, TaskDependencyOut } from './task-dependency.entity';
import { StateHistory, StateHistoryOut } from './state-history.entity';
import {
  ActivityEntry,
  ActivityEntryType,
  ActivityEntryOut,
  ActivityCommentIn,
} from './activity-entry.entity';
import { z } from 'zod';
import { TaskInSchema } from './task.entity';

// --- Batch create types ---

export const BatchTaskItemSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().min(1),
    priority: z.number().int().default(100),
    state: z.nativeEnum(TaskState).optional().default(TaskState.BACKLOG),
    parentId: z.string().uuid().optional(),
    /** Indices into the same batch array referencing tasks this one depends on */
    dependsOn: z.array(z.number().int().min(0)).optional().default([]),
  })
  .strict();
export type BatchTaskItem = z.infer<typeof BatchTaskItemSchema>;

export const BatchCreateSchema = z.object({
  project: z.string().min(1),
  tasks: z.array(BatchTaskItemSchema).min(1),
});
export type BatchCreate = z.infer<typeof BatchCreateSchema>;

// --- List filters ---

export const TaskListFiltersSchema = z.object({
  project: z.string().optional(),
  state: z.nativeEnum(TaskState).optional(),
  assignee: z.string().optional(),
  priorityMin: z.number().int().optional(),
  priorityMax: z.number().int().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  search: z.string().optional(),
});
export type TaskListFilters = z.infer<typeof TaskListFiltersSchema>;

// --- Response types ---

export const HistoryResponseSchema = z.object({
  transitions: z.array(
    z.object({
      id: z.string().uuid(),
      taskId: z.string().uuid(),
      fromState: z.nativeEnum(TaskState).nullable(),
      toState: z.nativeEnum(TaskState),
      timestamp: z.date(),
    })
  ),
  durations: z.record(z.string(), z.number().nullable()),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

export const NextTaskBodySchema = z.object({
  assignee: z.string().min(1),
  project: z.string().min(1),
});
export type NextTaskBody = z.infer<typeof NextTaskBodySchema>;

export class TasksService {
  private readonly _tasks = inject(Database).repositoryFor(Task);
  private readonly _deps = inject(Database).repositoryFor(TaskDependency);
  private readonly _history = inject(Database).repositoryFor(StateHistory);
  private readonly _activity = inject(Database).repositoryFor(ActivityEntry);

  // ------------------------------------------------------------------ helpers

  private mapToOut(task: Task): TaskOut {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      state: task.state,
      priority: task.priority,
      project: task.project,
      assignee: task.assignee ?? null,
      assignedAt: task.assignedAt ?? null,
      parentId: task.parentId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private async _logHistory(
    taskId: string,
    fromState: TaskState | null | undefined,
    toState: TaskState,
    historyRepo = this._history
  ): Promise<void> {
    await historyRepo.save(
      historyRepo.create({
        taskId,
        fromState: fromState ?? undefined,
        toState,
        timestamp: new Date(),
      })
    );
  }

  private async _logActivity(
    taskId: string,
    type: ActivityEntryType,
    author: string,
    content: string,
    metadata?: Record<string, unknown>,
    activityRepo = this._activity
  ): Promise<void> {
    await activityRepo.save(
      activityRepo.create({
        taskId,
        type,
        author,
        content,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      })
    );
  }

  private async _checkDependencyCycle(
    taskId: string,
    newDepId: string
  ): Promise<void> {
    // BFS from newDepId — if we reach taskId, adding this edge creates a cycle
    const visited = new Set<string>([newDepId]);
    const queue: string[] = [newDepId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = await this._deps.find({ where: { taskId: current } });
      for (const dep of deps) {
        if (dep.dependsOnId === taskId) {
          throw new HttpErrors.BadRequest(
            'Adding this dependency would create a cycle (DEPENDENCY_CYCLE)'
          );
        }
        if (!visited.has(dep.dependsOnId)) {
          visited.add(dep.dependsOnId);
          queue.push(dep.dependsOnId);
        }
      }
    }
  }

  private async _checkParentCycle(
    taskId: string,
    newParentId: string
  ): Promise<void> {
    // Walk up parentId chain — if we reach taskId, cycle detected
    let currentId: string | undefined = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === taskId) {
        throw new HttpErrors.BadRequest(
          'Setting this parent would create a cycle (PARENT_CYCLE)'
        );
      }
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const parent = await this._tasks.findOne({ where: { id: currentId } });
      currentId = parent?.parentId;
    }
  }

  private async _autoUnblockDependents(completedTaskId: string): Promise<void> {
    const deps = await this._deps.find({
      where: { dependsOnId: completedTaskId },
    });
    for (const dep of deps) {
      const blockedTask = await this._tasks.findOne({
        where: { id: dep.taskId },
      });
      if (!blockedTask || blockedTask.state !== TaskState.BLOCKED) continue;
      await this._checkAndUnblock(dep.taskId);
    }
  }

  private async _checkAndUnblock(taskId: string): Promise<void> {
    const deps = await this._deps.find({ where: { taskId } });
    if (deps.length === 0) return;

    const depIds = deps.map((d) => d.dependsOnId);
    const depTasks = await this._tasks
      .createQueryBuilder('t')
      .where('t.id IN (:...ids)', { ids: depIds })
      .andWhere('t.deletedAt IS NULL')
      .getMany();

    const allDone = depTasks.every((t) => t.state === TaskState.DONE);
    if (!allDone) return;

    const task = await this._tasks.findOne({ where: { id: taskId } });
    if (!task || task.state !== TaskState.BLOCKED) return;

    task.state = TaskState.TODO;
    await this._tasks.save(task);

    await this._logHistory(taskId, TaskState.BLOCKED, TaskState.TODO);
    await this._logActivity(
      taskId,
      ActivityEntryType.STATE_CHANGE,
      'system',
      'Task auto-unblocked: all dependencies are now DONE',
      { fromState: TaskState.BLOCKED, toState: TaskState.TODO }
    );
  }

  // ------------------------------------------------------------------ CRUD

  async create(input: TaskIn): Promise<TaskOut> {
    if (input.parentId) {
      const parent = await this._tasks.findOne({
        where: { id: input.parentId },
      });
      if (!parent) throw new HttpErrors.NotFound('Parent task not found');
      if (parent.project !== input.project) {
        throw new HttpErrors.BadRequest(
          'Subtask must belong to same project as parent (PARENT_PROJECT_MISMATCH)'
        );
      }
      // Check for cycle (task doesn't exist yet so we just validate the parent chain)
    }

    const task = this._tasks.create({ ...input });
    const saved = await this._tasks.save(task);

    await this._logHistory(saved.id, null, saved.state);
    await this._logActivity(
      saved.id,
      ActivityEntryType.STATE_CHANGE,
      'system',
      `Task created in state ${saved.state}`,
      { toState: saved.state }
    );

    if (input.parentId) {
      await this._logActivity(
        saved.id,
        ActivityEntryType.SUBTASK,
        'system',
        `Task created as subtask of ${input.parentId}`,
        { parentId: input.parentId }
      );
    }

    return this.mapToOut(saved);
  }

  async batchCreate(body: BatchCreate): Promise<TaskOut[]> {
    const { project, tasks: taskInputs } = body;
    const db = inject(Database).dataSource;

    return db.transaction(async (manager) => {
      const taskRepo = manager.getRepository(Task);
      const depRepo = manager.getRepository(TaskDependency);
      const historyRepo = manager.getRepository(StateHistory);

      const created: Task[] = [];

      for (const input of taskInputs) {
        if (input.parentId) {
          const parent = await taskRepo.findOne({
            where: { id: input.parentId },
          });
          if (!parent)
            throw new HttpErrors.NotFound(
              `Parent task ${input.parentId} not found`
            );
          if (parent.project !== project) {
            throw new HttpErrors.BadRequest(
              'Subtask must belong to same project as parent (PARENT_PROJECT_MISMATCH)'
            );
          }
        }

        const task = taskRepo.create({
          title: input.title,
          description: input.description,
          priority: input.priority ?? 100,
          project,
          state: input.state ?? TaskState.BACKLOG,
          parentId: input.parentId,
        });
        const saved = await taskRepo.save(task);
        created.push(saved);

        await historyRepo.save(
          historyRepo.create({
            taskId: saved.id,
            fromState: undefined,
            toState: saved.state,
            timestamp: new Date(),
          })
        );
      }

      // Process dependsOn index references
      for (let i = 0; i < taskInputs.length; i++) {
        const depIndices = taskInputs[i].dependsOn ?? [];
        for (const depIdx of depIndices) {
          if (depIdx < 0 || depIdx >= created.length) {
            throw new HttpErrors.BadRequest(
              `Invalid dependsOn index ${depIdx} for task at index ${i}: out of range`
            );
          }
          if (depIdx === i) {
            throw new HttpErrors.BadRequest(
              `Task at index ${i} cannot depend on itself`
            );
          }
          await depRepo.save(
            depRepo.create({
              taskId: created[i].id,
              dependsOnId: created[depIdx].id,
            })
          );
        }
      }

      return created.map((t) => this.mapToOut(t));
    });
  }

  async list(filters: TaskListFilters): Promise<TaskOut[]> {
    const qb = this._tasks
      .createQueryBuilder('task')
      .where('task.deletedAt IS NULL');

    if (filters.project)
      qb.andWhere('task.project = :project', { project: filters.project });
    if (filters.state)
      qb.andWhere('task.state = :state', { state: filters.state });
    if (filters.assignee)
      qb.andWhere('task.assignee = :assignee', { assignee: filters.assignee });
    if (filters.priorityMin != null)
      qb.andWhere('task.priority >= :pMin', { pMin: filters.priorityMin });
    if (filters.priorityMax != null)
      qb.andWhere('task.priority <= :pMax', { pMax: filters.priorityMax });
    if (filters.createdAfter)
      qb.andWhere('task.createdAt >= :after', {
        after: new Date(filters.createdAfter),
      });
    if (filters.createdBefore)
      qb.andWhere('task.createdAt <= :before', {
        before: new Date(filters.createdBefore),
      });
    if (filters.search) {
      qb.andWhere(
        '(task.title LIKE :search OR task.description LIKE :search)',
        {
          search: `%${filters.search}%`,
        }
      );
    }

    qb.orderBy('task.priority', 'ASC').addOrderBy('task.createdAt', 'ASC');

    return (await qb.getMany()).map((r) => this.mapToOut(r));
  }

  async getById(id: string): Promise<TaskOut> {
    const task = await this._tasks.findOne({ where: { id } });
    if (!task) throw new HttpErrors.NotFound('Task not found');
    return this.mapToOut(task);
  }

  async patch(id: string, input: TaskPatch): Promise<TaskOut> {
    const task = await this._tasks.findOne({ where: { id } });
    if (!task) throw new HttpErrors.NotFound('Task not found');

    if (input.parentId !== undefined) {
      if (input.parentId !== null) {
        const parent = await this._tasks.findOne({
          where: { id: input.parentId },
        });
        if (!parent) throw new HttpErrors.NotFound('Parent task not found');
        if (parent.project !== task.project) {
          throw new HttpErrors.BadRequest(
            'Subtask must belong to same project as parent (PARENT_PROJECT_MISMATCH)'
          );
        }
        await this._checkParentCycle(id, input.parentId);
      }
    }

    const oldParentId = task.parentId;
    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.parentId !== undefined)
      task.parentId = input.parentId ?? undefined;

    const saved = await this._tasks.save(task);

    if (
      input.parentId !== undefined &&
      input.parentId !== (oldParentId ?? null)
    ) {
      if (input.parentId) {
        await this._logActivity(
          id,
          ActivityEntryType.SUBTASK,
          'system',
          `Task set as subtask of ${input.parentId}`,
          { parentId: input.parentId }
        );
      } else {
        await this._logActivity(
          id,
          ActivityEntryType.SUBTASK,
          'system',
          `Task removed from parent ${oldParentId}`,
          { previousParentId: oldParentId }
        );
      }
    }

    return this.mapToOut(saved);
  }

  async delete(id: string): Promise<void> {
    const task = await this._tasks.findOne({ where: { id } });
    if (!task) throw new HttpErrors.NotFound('Task not found');

    const incomingDeps = await this._deps.count({ where: { dependsOnId: id } });
    if (incomingDeps > 0) {
      throw new HttpErrors.Conflict(
        'Cannot delete task: other tasks depend on it. Remove dependency links first. (DEPENDENCY_CONFLICT)'
      );
    }

    const subtaskCount = await this._tasks.count({ where: { parentId: id } });
    if (subtaskCount > 0) {
      throw new HttpErrors.Conflict(
        'Cannot delete task: task has subtasks. Delete or reparent them first. (SUBTASK_CONFLICT)'
      );
    }

    await this._tasks.softDelete(id);
  }

  // ---------------------------------------------------------------- transition

  async transition(id: string, toState: TaskState): Promise<TaskOut> {
    const task = await this._tasks.findOne({ where: { id } });
    if (!task) throw new HttpErrors.NotFound('Task not found');

    if (!canTransition(task.state, toState)) {
      throw new HttpErrors.BadRequest(
        `Cannot transition from ${task.state} to ${toState} (INVALID_TRANSITION)`
      );
    }

    if (toState === TaskState.DONE) {
      const subtasks = await this._tasks.find({ where: { parentId: id } });
      const incomplete = subtasks.filter((s) => s.state !== TaskState.DONE);
      if (incomplete.length > 0) {
        throw new HttpErrors.BadRequest(
          `Cannot complete task: ${
            incomplete.length
          } subtask(s) are not DONE: ${incomplete
            .map((s) => s.id)
            .join(', ')} (PARENT_HAS_INCOMPLETE_SUBTASKS)`
        );
      }
    }

    const fromState = task.state;
    task.state = toState;

    if (ASSIGNEE_CLEARING_STATES.has(toState)) {
      task.assignee = undefined;
      task.assignedAt = undefined;
    }

    const saved = await this._tasks.save(task);

    await this._logHistory(id, fromState, toState);
    await this._logActivity(
      id,
      ActivityEntryType.STATE_CHANGE,
      'system',
      `State changed from ${fromState} to ${toState}`,
      { fromState, toState }
    );

    if (toState === TaskState.DONE) {
      await this._autoUnblockDependents(id);
    }

    return this.mapToOut(saved);
  }

  // ---------------------------------------------------------------- next task

  async nextTask(assignee: string, project: string): Promise<TaskOut | null> {
    const db = inject(Database).dataSource;

    return db.transaction(async (manager) => {
      const taskRepo = manager.getRepository(Task);
      const depRepo = manager.getRepository(TaskDependency);
      const historyRepo = manager.getRepository(StateHistory);
      const activityRepo = manager.getRepository(ActivityEntry);

      // Check agent concurrency
      const existing = await taskRepo
        .createQueryBuilder('t')
        .where('t.assignee = :assignee', { assignee })
        .andWhere('t.project = :project', { project })
        .andWhere('t.state = :state', { state: TaskState.IN_PROGRESS })
        .andWhere('t.deletedAt IS NULL')
        .getOne();

      if (existing) {
        throw new HttpErrors.Conflict(
          `Agent ${assignee} already has IN_PROGRESS task ${existing.id} in project ${project} (ALREADY_ASSIGNED_IN_PROJECT)`
        );
      }

      // Fetch TODO candidates ordered by priority, then createdAt
      const candidates = await taskRepo
        .createQueryBuilder('t')
        .where('t.project = :project', { project })
        .andWhere('t.state = :state', { state: TaskState.TODO })
        .andWhere('t.deletedAt IS NULL')
        .orderBy('t.priority', 'ASC')
        .addOrderBy('t.createdAt', 'ASC')
        .getMany();

      if (candidates.length === 0) return null;

      // Find first candidate whose active deps are all DONE
      let eligible: Task | null = null;
      for (const candidate of candidates) {
        const deps = await depRepo.find({ where: { taskId: candidate.id } });
        if (deps.length === 0) {
          eligible = candidate;
          break;
        }

        const depIds = deps.map((d) => d.dependsOnId);
        const depTasks = await taskRepo
          .createQueryBuilder('t')
          .where('t.id IN (:...ids)', { ids: depIds })
          .andWhere('t.deletedAt IS NULL')
          .getMany();

        if (depTasks.every((t) => t.state === TaskState.DONE)) {
          eligible = candidate;
          break;
        }
      }

      if (!eligible) return null;

      const fromState = eligible.state;
      eligible.state = TaskState.IN_PROGRESS;
      eligible.assignee = assignee;
      eligible.assignedAt = new Date();
      const saved = await taskRepo.save(eligible);

      await historyRepo.save(
        historyRepo.create({
          taskId: saved.id,
          fromState,
          toState: TaskState.IN_PROGRESS,
          timestamp: new Date(),
        })
      );

      await activityRepo.save(
        activityRepo.create({
          taskId: saved.id,
          type: ActivityEntryType.ASSIGNMENT,
          author: 'system',
          content: `Task assigned to ${assignee} and moved to IN_PROGRESS`,
          metadata: JSON.stringify({
            assignee,
            fromState,
            toState: TaskState.IN_PROGRESS,
          }),
        })
      );

      return this.mapToOut(saved);
    });
  }

  // ------------------------------------------------------------ dependencies

  async addDependency(
    taskId: string,
    dependsOnId: string
  ): Promise<TaskDependencyOut> {
    if (taskId === dependsOnId) {
      throw new HttpErrors.BadRequest('A task cannot depend on itself');
    }

    const [task, depTask] = await Promise.all([
      this._tasks.findOne({ where: { id: taskId } }),
      this._tasks.findOne({ where: { id: dependsOnId } }),
    ]);
    if (!task) throw new HttpErrors.NotFound('Task not found');
    if (!depTask) throw new HttpErrors.NotFound('Dependency task not found');

    await this._checkDependencyCycle(taskId, dependsOnId);

    const existing = await this._deps.findOne({
      where: { taskId, dependsOnId },
    });
    if (existing) throw new HttpErrors.Conflict('Dependency already exists');

    const dep = await this._deps.save(
      this._deps.create({ taskId, dependsOnId })
    );

    await this._logActivity(
      taskId,
      ActivityEntryType.DEPENDENCY,
      'system',
      `Dependency added: this task now depends on ${dependsOnId}`,
      { dependsOnId, action: 'added' }
    );

    return dep;
  }

  async listDependencies(taskId: string): Promise<TaskDependencyOut[]> {
    const task = await this._tasks.findOne({ where: { id: taskId } });
    if (!task) throw new HttpErrors.NotFound('Task not found');
    return this._deps.find({ where: { taskId } });
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<void> {
    const dep = await this._deps.findOne({ where: { taskId, dependsOnId } });
    if (!dep) throw new HttpErrors.NotFound('Dependency not found');
    await this._deps.remove(dep);

    await this._logActivity(
      taskId,
      ActivityEntryType.DEPENDENCY,
      'system',
      `Dependency removed: this task no longer depends on ${dependsOnId}`,
      { dependsOnId, action: 'removed' }
    );

    // Auto-unblock if this task is BLOCKED and is now unblocked
    const blockedTask = await this._tasks.findOne({ where: { id: taskId } });
    if (blockedTask?.state === TaskState.BLOCKED) {
      await this._checkAndUnblock(taskId);
    }
  }

  // --------------------------------------------------------------- subtasks

  async listSubtasks(parentId: string): Promise<TaskOut[]> {
    const parent = await this._tasks.findOne({ where: { id: parentId } });
    if (!parent) throw new HttpErrors.NotFound('Task not found');
    const subtasks = await this._tasks.find({ where: { parentId } });
    return subtasks.map((t) => this.mapToOut(t));
  }

  // ----------------------------------------------------------- state history

  async getHistory(taskId: string): Promise<HistoryResponse> {
    const task = await this._tasks.findOne({ where: { id: taskId } });
    if (!task) throw new HttpErrors.NotFound('Task not found');

    const transitions = await this._history.find({
      where: { taskId },
      order: { timestamp: 'ASC' },
    });

    const durations: Record<string, number | null> = {};
    for (let i = 0; i < transitions.length; i++) {
      const entry = transitions[i];
      const next = transitions[i + 1];
      const key = entry.toState as string;
      if (next) {
        const ms = next.timestamp.getTime() - entry.timestamp.getTime();
        durations[key] = (durations[key] ?? 0) + ms;
      } else {
        // Still in this state — ongoing
        durations[key] = null;
      }
    }

    return {
      transitions: transitions.map((t) => ({
        id: t.id,
        taskId: t.taskId,
        fromState: t.fromState ?? null,
        toState: t.toState,
        timestamp: t.timestamp,
      })),
      durations,
    };
  }

  // ---------------------------------------------------------------- activity

  async getActivity(taskId: string): Promise<ActivityEntryOut[]> {
    const task = await this._tasks.findOne({ where: { id: taskId } });
    if (!task) throw new HttpErrors.NotFound('Task not found');

    const entries = await this._activity.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });

    return entries.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      type: e.type,
      author: e.author ?? null,
      content: e.content,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
      createdAt: e.createdAt,
    }));
  }

  async postComment(
    taskId: string,
    input: ActivityCommentIn
  ): Promise<ActivityEntryOut> {
    const task = await this._tasks.findOne({ where: { id: taskId } });
    if (!task) throw new HttpErrors.NotFound('Task not found');

    const entry = await this._activity.save(
      this._activity.create({
        taskId,
        type: ActivityEntryType.COMMENT,
        author: input.author,
        content: input.content,
      })
    );

    return {
      id: entry.id,
      taskId: entry.taskId,
      type: entry.type,
      author: entry.author ?? null,
      content: entry.content,
      metadata: null,
      createdAt: entry.createdAt,
    };
  }

  // ------------------------------------------------------------------ expiry (called by cron)

  async expireStaleInProgressTasks(ttlMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

    const staleTasks = await this._tasks
      .createQueryBuilder('t')
      .where('t.state = :state', { state: TaskState.IN_PROGRESS })
      .andWhere('t.assignedAt <= :cutoff', { cutoff: cutoff.toISOString() })
      .andWhere('t.deletedAt IS NULL')
      .getMany();

    for (const task of staleTasks) {
      const fromState = task.state;
      task.state = TaskState.TODO;
      task.assignee = undefined;
      task.assignedAt = undefined;
      await this._tasks.save(task);

      await this._logHistory(task.id, fromState, TaskState.TODO);
      await this._logActivity(
        task.id,
        ActivityEntryType.STATE_CHANGE,
        'system',
        `Task auto-expired after ${ttlMinutes} minutes in IN_PROGRESS. Reverted to TODO, assignee cleared.`,
        { fromState, toState: TaskState.TODO, ttlMinutes }
      );
    }

    if (staleTasks.length > 0) {
      console.log(
        `[expiry] Reverted ${staleTasks.length} stale IN_PROGRESS task(s) to TODO`
      );
    }

    return staleTasks.length;
  }
}
