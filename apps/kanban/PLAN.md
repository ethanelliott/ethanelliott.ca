# Kanban Board Service — PLAN

## Overview

A lightweight kanban board API designed for **multi-agent concurrent task management**. Agents (or humans) can fetch the next available task for a given project, which atomically assigns it and marks it in-progress — preventing duplicate work. Tasks support blocking/dependency relationships, state machine–enforced transitions, and per-project/per-user scoping.

Stored in **SQLite** via TypeORM + better-sqlite3, so it runs locally with zero infrastructure.

---

## Design Decisions

| Decision                  | Choice                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                     | App code only — no Helm chart / ArgoCD deployment for now                                                                                    |
| DONE state                | **Terminal** — once DONE, stays DONE. Entry requires passing through `IN_REVIEW`. Create a new task if work needs to be revisited            |
| Labels                    | Omitted from v1 for simplicity                                                                                                               |
| Batch create              | `POST /tasks/batch` with inline dependency references by index                                                                               |
| Stale task handling       | Auto-expire `IN_PROGRESS` tasks after **30 min** (default, configurable via `TASK_TTL_MINUTES` env var) back to `TODO` with assignee cleared |
| Expire detection          | Background cron job sweeping every 5 minutes (node-cron)                                                                                     |
| Dependency cycles         | Rejected on creation — returns `400` if adding a dep would form a cycle                                                                      |
| Deleting depended-on task | **Blocked** — returns `409 Conflict`; caller must remove dependency links first                                                              |
| Project field             | **Required** on every task                                                                                                                   |
| GET /tasks filters        | project, state, assignee, priority range, date range, text search on title/description                                                       |
| Pagination                | None — return all matching results (task counts are manageable for agent boards)                                                             |
| Agent concurrency         | **1 IN_PROGRESS task per agent per project** — `/tasks/next` refuses if agent already has one                                                |
| Assignee on TODO/BACKLOG  | **Cleared** — moving to TODO or BACKLOG clears assignee so another agent can pick it up                                                      |
| Assignee on DONE          | **Kept** — so you can see who completed the task                                                                                             |
| Assignment method         | **Only via `/tasks/next`** — PATCH cannot set assignee directly                                                                              |
| PATCH scope               | `PATCH /tasks/:id` supports `title`, `description`, `priority`, and `parentId` (set or `null`)                                               |
| BLOCKED behavior          | **Hybrid** — manual transition to `BLOCKED` is allowed; tasks auto-return to `TODO` when dependencies become all `DONE`                      |
| Next-task atomicity       | Optimized for **single app instance** SQLite deployment; transactional claim prevents duplicate assignment                                   |
| Soft delete               | **Soft delete** with `deletedAt` column — excluded from queries by default, protects history                                                 |
| Description               | **Required** on task creation                                                                                                                |
| Time tracking             | Full **state history log** — record every state entry/exit with timestamps; compute durations on read                                        |
| Activity log              | **Auto + manual** — system auto-logs state transitions, assignments, dep changes; agents can also post markdown comments                     |
| Subtasks                  | Any task can be a subtask of another (via `parentId`); **parent cannot move to DONE until all subtasks are DONE**; cycles rejected           |

---

## Core Concepts

### Task States (State Machine)

```
BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE
                      ↓
             BLOCKED       (manual or derived; auto-unblocks when deps are DONE)
```

**Allowed transitions:**

| From          | To                                |
| ------------- | --------------------------------- |
| `BACKLOG`     | `TODO`                            |
| `TODO`        | `IN_PROGRESS`, `BACKLOG`          |
| `IN_PROGRESS` | `IN_REVIEW`, `BLOCKED`, `TODO`    |
| `BLOCKED`     | `TODO`                            |
| `IN_REVIEW`   | `DONE`, `IN_PROGRESS`             |
| `DONE`        | _(terminal — no transitions out)_ |

The state machine is enforced server-side. Invalid transitions return `400 Bad Request`.

### Blocking / Dependencies

- A task can declare dependencies: "Task A depends on Task B" means A **cannot** start until B is `DONE`.
- When fetching the next task, only tasks whose **all** dependencies are `DONE` are eligible.
- `BLOCKED` is **hybrid**: callers may transition a task to `BLOCKED`, and the system also treats incomplete dependencies as blocking conditions.
- When a `BLOCKED` task’s dependencies become all `DONE`, it is automatically transitioned to `TODO` (assignee retained unless another rule clears it).
- **Cycle detection**: Adding a dependency that would create a cycle (A → B → A) is rejected with `400`.
- **Delete protection**: A task that is depended on by other tasks cannot be deleted (`409 Conflict`). Remove the dependency links first.

### Priority

Tasks have an integer `priority` field (lower = higher priority). The "next task" endpoint returns the highest-priority eligible task.

### Subtasks

- Any task can be a child of another task via the `parentId` field.
- A parent task **cannot** transition to `DONE` until all of its subtasks are `DONE`. The transition endpoint returns `400` with a message listing the incomplete subtasks.
- Subtask hierarchies cannot form cycles — setting `parentId` runs the same BFS cycle detection as dependencies (walking up `parentId` chain to ensure the target child is not an ancestor of the proposed parent).
- Subtasks inherit the parent's `project` (enforced on creation).
- Deleting a parent task is blocked if it has non-deleted subtasks (`409 Conflict`).

### Time Tracking (State History)

- Every state transition is recorded in a **StateHistory** log with `fromState`, `toState`, and `timestamp`.
- Durations per state can be computed on read: `GET /tasks/:id/history` returns the full timeline and a `durations` summary (milliseconds spent in each state).
- The auto-expiry cron also records a history entry when reverting stale tasks.

### Activity Log

- A unified activity feed per task combining **system events** and **manual comments**.
- **System events** are auto-generated for: state transitions, assignment changes, dependency additions/removals, subtask additions/removals.
- **Manual comments** can be posted by agents with markdown-formatted content — useful for progress updates, blockers, or notes.
- Activity entries are append-only and immutable.

### Stale Task Auto-Expiry

Tasks in `IN_PROGRESS` for longer than the configured TTL (default **30 minutes**, set via `TASK_TTL_MINUTES` env var) are automatically reverted to `TODO` with their assignee cleared. A background cron job runs every 5 minutes to sweep for expired tasks. This ensures crashed or abandoned agents don't permanently lock tasks.

---

## Data Model

### Task Entity

| Column        | Type         | Description                                                                                   |
| ------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `id`          | `uuid` (PK)  | Auto-generated                                                                                |
| `title`       | `string`     | Short task title                                                                              |
| `description` | `text`       | Detailed description (markdown)                                                               |
| `state`       | `enum`       | Current state (BACKLOG, TODO, etc.)                                                           |
| `priority`    | `integer`    | Lower = higher priority (default: 100)                                                        |
| `project`     | `string`     | Project identifier — **required**                                                             |
| `assignee`    | `string?`    | Assigned user/agent (null if unassigned). Cleared on transition to TODO/BACKLOG; kept on DONE |
| `assignedAt`  | `datetime?`  | When the task was assigned (for TTL calc)                                                     |
| `createdAt`   | `datetime`   | Auto-set on creation                                                                          |
| `updatedAt`   | `datetime`   | Auto-updated on mutation                                                                      |
| `parentId`    | `uuid?` (FK) | Parent task ID (null if top-level). Cycles rejected                                           |
| `deletedAt`   | `datetime?`  | Soft delete timestamp (null if active)                                                        |

### StateHistory Entity

| Column      | Type        | Description                                |
| ----------- | ----------- | ------------------------------------------ |
| `id`        | `uuid` (PK) | Auto-generated                             |
| `taskId`    | `uuid` (FK) | The task this history entry belongs to     |
| `fromState` | `enum?`     | Previous state (null for initial creation) |
| `toState`   | `enum`      | New state                                  |
| `timestamp` | `datetime`  | When the transition occurred               |

### ActivityEntry Entity

| Column      | Type        | Description                                                      |
| ----------- | ----------- | ---------------------------------------------------------------- |
| `id`        | `uuid` (PK) | Auto-generated                                                   |
| `taskId`    | `uuid` (FK) | The task this entry belongs to                                   |
| `type`      | `enum`      | `COMMENT`, `STATE_CHANGE`, `ASSIGNMENT`, `DEPENDENCY`, `SUBTASK` |
| `author`    | `string?`   | Who created the entry (agent name, or `system`)                  |
| `content`   | `text`      | Markdown comment body, or auto-generated description             |
| `metadata`  | `text?`     | JSON blob with structured data (e.g. `{ fromState, toState }`)   |
| `createdAt` | `datetime`  | When the entry was created                                       |

### TaskDependency Entity

| Column        | Type        | Description                       |
| ------------- | ----------- | --------------------------------- |
| `id`          | `uuid` (PK) | Auto-generated                    |
| `taskId`      | `uuid` (FK) | The task that is blocked          |
| `dependsOnId` | `uuid` (FK) | The task that must complete first |

---

## API Endpoints

### Tasks CRUD

| Method   | Path           | Description                                                                               |
| -------- | -------------- | ----------------------------------------------------------------------------------------- |
| `POST`   | `/tasks`       | Create a new task                                                                         |
| `POST`   | `/tasks/batch` | Batch create tasks with inline dependency references                                      |
| `GET`    | `/tasks`       | List tasks (filters: see below)                                                           |
| `GET`    | `/tasks/:id`   | Get a single task by ID                                                                   |
| `PATCH`  | `/tasks/:id`   | Update task fields (`title`, `description`, `priority`, `parentId`) — cannot set assignee |
| `DELETE` | `/tasks/:id`   | Soft-delete a task (409 if other tasks depend on it)                                      |

#### GET /tasks Query Parameters

| Param           | Type     | Description                                         |
| --------------- | -------- | --------------------------------------------------- |
| `project`       | `string` | Filter by project                                   |
| `state`         | `enum`   | Filter by state                                     |
| `assignee`      | `string` | Filter by assignee                                  |
| `priorityMin`   | `int`    | Minimum priority (inclusive)                        |
| `priorityMax`   | `int`    | Maximum priority (inclusive)                        |
| `createdAfter`  | `string` | ISO 8601 date — only tasks created after this date  |
| `createdBefore` | `string` | ISO 8601 date — only tasks created before this date |
| `search`        | `string` | Text search on title and description (LIKE %query%) |

### State Transitions

| Method | Path                    | Description                                    |
| ------ | ----------------------- | ---------------------------------------------- |
| `POST` | `/tasks/:id/transition` | Move a task to a new state (body: `{ state }`) |

Validates the transition against the state machine. Returns `400` if invalid.

### Next Task (Agent Assignment)

| Method | Path          | Description                            |
| ------ | ------------- | -------------------------------------- |
| `POST` | `/tasks/next` | Fetch & assign the next available task |

**Request body:**

```json
{
  "assignee": "agent-1",
  "project": "chat-frontend"
}
```

**Behavior:**

1. Find all tasks in `TODO` state for the given `project`
2. Filter to only tasks whose **all** dependencies are `DONE`
3. Order by `priority` ASC (lowest number = highest priority), then `createdAt` ASC
4. **Check concurrency**: If the agent already has an `IN_PROGRESS` task in this project, return `409 Conflict`
5. Assign the top task to the given `assignee`, set `assignedAt` to now, transition to `IN_PROGRESS`
6. Return the task — or `404` if no eligible tasks

This is **atomic** — concurrent calls will not hand out the same task.

Deployment assumption for v1: **single app instance** with SQLite. Atomicity is provided by a single DB transaction around eligibility check + assignment + transition.

### Batch Create

| Method | Path           | Description                                             |
| ------ | -------------- | ------------------------------------------------------- |
| `POST` | `/tasks/batch` | Create multiple tasks with inline dependency references |

**Request body:**

```json
{
  "project": "chat-frontend",
  "tasks": [
    { "title": "Implement auth", "priority": 1, "state": "TODO" },
    { "title": "Add message UI", "priority": 2, "state": "TODO" },
    { "title": "Write tests", "priority": 3, "state": "TODO", "dependsOn": [0] }
  ]
}
```

`dependsOn` is an array of **indices** into the same batch array. In the example above, "Write tests" (index 2) depends on "Implement auth" (index 0). All tasks are created in a single transaction.

### Dependencies

| Method   | Path                                   | Description                                                 |
| -------- | -------------------------------------- | ----------------------------------------------------------- |
| `POST`   | `/tasks/:id/dependencies`              | Add a dependency (body: `{ dependsOnId }`) — rejects cycles |
| `GET`    | `/tasks/:id/dependencies`              | List dependencies for a task                                |
| `DELETE` | `/tasks/:id/dependencies/:dependsOnId` | Remove a dependency                                         |

### Subtasks

| Method | Path                  | Description             |
| ------ | --------------------- | ----------------------- |
| `GET`  | `/tasks/:id/subtasks` | List subtasks of a task |

Subtasks are created via `POST /tasks` or `POST /tasks/batch` with `parentId` set. Subtask-parent relationship is removed by PATCHing `parentId` to `null`.

### State History & Time Tracking

| Method | Path                 | Description                                                     |
| ------ | -------------------- | --------------------------------------------------------------- |
| `GET`  | `/tasks/:id/history` | Get full state transition timeline + per-state duration summary |

**Response shape:**

```json
{
  "transitions": [
    {
      "fromState": null,
      "toState": "BACKLOG",
      "timestamp": "2026-03-03T10:00:00Z"
    },
    {
      "fromState": "BACKLOG",
      "toState": "TODO",
      "timestamp": "2026-03-03T10:05:00Z"
    },
    {
      "fromState": "TODO",
      "toState": "IN_PROGRESS",
      "timestamp": "2026-03-03T10:10:00Z"
    }
  ],
  "durations": {
    "BACKLOG": 300000,
    "TODO": 300000,
    "IN_PROGRESS": null
  }
}
```

Durations are in milliseconds. The current state's duration is `null` (still active) — clients can compute it from the last transition timestamp.

### Activity Log

| Method | Path                  | Description                                         |
| ------ | --------------------- | --------------------------------------------------- |
| `GET`  | `/tasks/:id/activity` | Get all activity entries (system + manual)          |
| `POST` | `/tasks/:id/activity` | Post a manual comment (body: `{ author, content }`) |

System entries are auto-generated and have `author: "system"`. Manual comments have the posting agent's name as `author`.

### Projects

| Method | Path        | Description                                          |
| ------ | ----------- | ---------------------------------------------------- |
| `GET`  | `/projects` | List all distinct projects with task counts by state |

---

## Project Structure

```
apps/kanban/
├── Dockerfile
├── PLAN.md
├── project.json
├── tsconfig.app.json
├── tsconfig.json
└── src/
    ├── main.ts
    └── app/
        ├── app.ts
        ├── app.config.ts
        ├── data-source.ts
        ├── state-machine.ts
        ├── expiry.ts              # Cron job for stale task auto-expiry
        ├── tasks/
        │   ├── index.ts
        │   ├── task.entity.ts
        │   ├── task-dependency.entity.ts
        │   ├── state-history.entity.ts
        │   ├── activity-entry.entity.ts
        │   ├── tasks.router.ts
        │   └── tasks.service.ts
        └── projects/
            ├── index.ts
            ├── projects.router.ts
            └── projects.service.ts
```

Follows the existing monorepo conventions:

- Fastify + Zod type provider
- TypeORM + better-sqlite3
- `@ee/starter`, `@ee/di` shared libs
- esbuild via Nx
- Standard Dockerfile (Alpine, non-root user, `/app/data/` for DB)

---

## State Machine Implementation

A simple map-based state machine:

```ts
const STATE_TRANSITIONS: Record<TaskState, TaskState[]> = {
  BACKLOG: [TaskState.TODO],
  TODO: [TaskState.IN_PROGRESS, TaskState.BACKLOG],
  IN_PROGRESS: [TaskState.IN_REVIEW, TaskState.BLOCKED, TaskState.TODO],
  BLOCKED: [TaskState.TODO],
  IN_REVIEW: [TaskState.DONE, TaskState.IN_PROGRESS],
  DONE: [],
};

function canTransition(from: TaskState, to: TaskState): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}
```

---

## Normative Rules (Precedence)

1. **Terminal rule**: `DONE` has no outgoing transitions.
2. **Review gate**: reaching `DONE` requires current state `IN_REVIEW`.
3. **Subtask gate**: transition to `DONE` is rejected if any non-deleted subtask is not `DONE`.
4. **Dependency gate for assignment**: `/tasks/next` may only select tasks whose active dependencies are all `DONE`.
5. **Hybrid BLOCKED rule**: manual `IN_PROGRESS -> BLOCKED` is valid; additionally, blocked-by-dependency tasks may be represented as `BLOCKED` and auto-transition to `TODO` once dependencies are satisfied.
6. **Assignee rule precedence**: when transitioning to `TODO` or `BACKLOG`, assignee is cleared.
7. **Patch rule**: `PATCH /tasks/:id` must reject direct `assignee` writes; only `/tasks/next` can assign.

---

## DB Constraints & Indexes (v1)

- `TaskDependency(taskId, dependsOnId)` unique constraint.
- `TaskDependency` check constraint: `taskId != dependsOnId`.
- Index `Task(project, state, priority, createdAt)` for `/tasks/next` candidate scan.
- Index `Task(project, assignee, state)` for agent concurrency checks.
- Index `Task(deletedAt)` (or partial index on active rows where supported).
- Index `Task(parentId, deletedAt)` for subtask checks.
- Index `StateHistory(taskId, timestamp)` for timeline reads.
- Index `ActivityEntry(taskId, createdAt)` for activity feeds.

---

## Error Response Contract

All non-2xx responses use a consistent envelope:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot transition from TODO to DONE",
    "details": {
      "from": "TODO",
      "to": "DONE"
    }
  }
}
```

Suggested canonical codes:

- `VALIDATION_ERROR` (400)
- `INVALID_TRANSITION` (400)
- `DEPENDENCY_CYCLE` (400)
- `PARENT_CYCLE` (400)
- `PARENT_PROJECT_MISMATCH` (400)
- `PARENT_HAS_INCOMPLETE_SUBTASKS` (400)
- `NOT_FOUND` (404)
- `ALREADY_ASSIGNED_IN_PROJECT` (409)
- `DEPENDENCY_CONFLICT` (409)
- `SUBTASK_CONFLICT` (409)

---

## Dependency Cycle Detection

When adding a dependency (A depends on B), perform a DFS/BFS from B following its own dependencies. If A is reachable from B, adding this edge would create a cycle → reject with `400`.

```
addDependency(taskId: A, dependsOnId: B):
  1. visited = {B}
  2. queue = [B]
  3. while queue not empty:
       current = queue.pop()
       for each dep of current:
         if dep == A → CYCLE DETECTED, return 400
         if dep not in visited:
           visited.add(dep)
           queue.push(dep)
  4. No cycle → insert dependency
```

---

## Implementation Steps

1. **Scaffold project files** — `project.json`, `tsconfig.app.json`, `tsconfig.json`, `Dockerfile`
2. **Data layer** — `data-source.ts`, all entity files (Task, TaskDependency, StateHistory, ActivityEntry) with Zod schemas
3. **State machine** — `state-machine.ts` with transition validation + subtask completion check
4. **Cycle detection** — in tasks service, BFS before inserting dependencies AND before setting `parentId`
5. **Services** — `tasks.service.ts` (CRUD, batch, subtasks, next-task logic, transitions, history, activity), `projects.service.ts`
6. **Activity auto-logging** — hook into state transitions, assignments, dep changes, subtask changes to auto-create entries
7. **Expiry cron** — `expiry.ts` with node-cron sweeping stale `IN_PROGRESS` tasks (also logs activity + history entries)
8. **Routers** — Wire up all endpoints with Zod request/response schemas
9. **App bootstrap** — `app.ts`, `app.config.ts`, `main.ts`
10. **Dockerfile** — Standard Alpine pattern
11. **Test locally** — `bun nx serve kanban`

---

## Example Workflows

### Agent picks up work

```
POST /tasks/next
{ "assignee": "agent-copilot-3", "project": "chat-frontend" }

→ 200 { id: "abc", title: "Add message threading", state: "IN_PROGRESS", assignee: "agent-copilot-3", ... }
```

### Agent completes work

```
POST /tasks/abc/transition
{ "state": "IN_REVIEW" }

→ 200 { id: "abc", state: "IN_REVIEW", ... }
```

### Agent marks review as done

```
POST /tasks/abc/transition
{ "state": "DONE" }

→ 200 { id: "abc", state: "DONE", ... }
```

### Batch task creation with dependencies

```
POST /tasks/batch
{
  "project": "chat-frontend",
  "tasks": [
    { "title": "Implement auth", "priority": 1, "state": "TODO" },
    { "title": "Add message UI", "priority": 2, "state": "TODO" },
    { "title": "Write tests", "priority": 3, "state": "TODO", "dependsOn": [0] }
  ]
}

→ 201 [
  { id: "aaa", title: "Implement auth", ... },
  { id: "bbb", title: "Add message UI", ... },
  { id: "ccc", title: "Write tests", ... }   // depends on "aaa"
]
```

Now "Write tests" won't be handed out until "Implement auth" is `DONE`.

### Stale task auto-recovery

```
Agent-1 picks up task "Fix login bug" at 10:00 AM → state: IN_PROGRESS
Agent-1 crashes and never reports back.
10:30 AM — cron sweep finds the task has been IN_PROGRESS for 30+ min.
Task reverts to TODO, assignee cleared. Another agent can now pick it up.
```

### Agent posts progress updates

```
POST /tasks/abc/activity
{ "author": "agent-copilot-3", "content": "Refactored the auth module. JWT refresh logic is working. Moving on to integration tests." }

→ 201 { id: "entry-1", taskId: "abc", type: "COMMENT", author: "agent-copilot-3", content: "...", createdAt: "..." }
```

### Checking how long a task has been in each state

```
GET /tasks/abc/history

→ 200 {
  transitions: [
    { fromState: null, toState: "TODO", timestamp: "10:00" },
    { fromState: "TODO", toState: "IN_PROGRESS", timestamp: "10:05" },
    { fromState: "IN_PROGRESS", toState: "IN_REVIEW", timestamp: "11:30" }
  ],
  durations: { TODO: 300000, IN_PROGRESS: 5100000, IN_REVIEW: null }
}
```

### Subtask blocking parent completion

```
POST /tasks/parent-id/transition
{ "state": "DONE" }

→ 400 { error: "Cannot complete task: 2 subtasks are not DONE", subtasks: ["subtask-1", "subtask-2"] }
```

---

## Environment Variables

| Variable           | Default   | Description                                |
| ------------------ | --------- | ------------------------------------------ |
| `PORT`             | `3000`    | Server listen port                         |
| `HOST`             | `0.0.0.0` | Server listen host                         |
| `TASK_TTL_MINUTES` | `30`      | Minutes before an IN_PROGRESS task expires |

---

## Behavioral Notes

### Assignee Clearing Rules

| Transition target | Assignee behavior                       |
| ----------------- | --------------------------------------- |
| `TODO`            | Cleared (available for `/next`)         |
| `BACKLOG`         | Cleared                                 |
| `IN_PROGRESS`     | Set (only via `/tasks/next`)            |
| `BLOCKED`         | Kept (still "owned" but can't progress) |
| `IN_REVIEW`       | Kept                                    |
| `DONE`            | Kept (record of who completed it)       |
| Expired (cron)    | Cleared + reverted to `TODO`            |

### Agent Concurrency

An agent can have at most **1 IN_PROGRESS task per project**. `POST /tasks/next` returns `409 Conflict` with a message identifying the existing task if the agent already has one active in that project. This prevents agents from hoarding tasks and encourages finishing work before starting new tasks.

### Soft Delete

Deleted tasks have their `deletedAt` set to the current timestamp. They are excluded from all query results by default.

Canonical dependency rule: only dependencies that point to **active (non-deleted)** tasks participate in blocking checks. If a dependency target is soft-deleted, it is ignored for eligibility and blocking.
