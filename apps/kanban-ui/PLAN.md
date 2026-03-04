# Kanban UI — PLAN

## Overview

A real-time Angular frontend for the **Kanban Board Service** (`apps/kanban`). Designed to give a full, live overview of the agentic task pipeline: who is working on what, what's queued next, the full audit trail of every task, and interactive controls to manage the board.

Stack: **Angular (zoneless)** + **PrimeNG** + **Server-Sent Events** for live streaming, consistent with the existing frontends in this monorepo.

---

## Goals

| Goal                          | Description                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Live board view**           | Kanban columns rendered per state, auto-updating via SSE without polling                                             |
| **Agent dashboard**           | Real-time panel showing every active agent, which task they hold, time elapsed, and expired/stale warning indicators |
| **Queue preview**             | Ordered list of upcoming TODO/BACKLOG tasks, respecting dependency eligibility and priority                          |
| **Task detail & audit trail** | Full state history timeline, activity log (system + comments), dependency graph, subtask tree                        |
| **Board actions**             | Create tasks, transition states, block/unblock, add/remove dependencies, post comments                               |
| **Project switcher**          | All endpoints are scoped by project; the UI surfaces a selector that persists in URL/state                           |

---

## Backend SSE Extension

The kanban service currently has no streaming endpoint. A new SSE endpoint must be added to the service before the UI can consume live events.

### New endpoint: `GET /events`

Streams `text/event-stream` over a persistent HTTP connection. Query params:

| Param     | Description                                  |
| --------- | -------------------------------------------- |
| `project` | (optional) only emit events for this project |

Each event is a JSON-encoded envelope:

```
event: task_updated
data: { "type": "task_updated", "payload": { ...TaskOut } }

event: task_created
data: { "type": "task_created", "payload": { ...TaskOut } }

event: task_deleted
data: { "type": "task_deleted", "payload": { "id": "..." } }

event: task_expired
data: { "type": "task_expired", "payload": { "id": "...", "previousAssignee": "..." } }

event: activity_added
data: { "type": "activity_added", "payload": { "taskId": "...", ...ActivityEntryOut } }

event: heartbeat
data: { "type": "heartbeat", "ts": "<ISO timestamp>" }
```

**Implementation approach in `apps/kanban`:**

- Maintain an in-process `EventBus` (a simple `EventEmitter` singleton) inside the service.
- Any time `TasksService` or the expiry cron mutates state, it emits to the bus.
- The SSE route keeps an `AsyncGenerator` alive for each connected client, forwarding events from the bus; on client disconnect it unregisters.
- Send a `heartbeat` event every 15 seconds to keep connections alive through proxies.
- The frontend reconnects automatically on connection loss (browser `EventSource` does this natively).

**New file: `apps/kanban/src/app/event-bus.ts`**

```ts
// Simple in-process pub/sub for SSE fan-out
```

**New endpoint added to `tasks.router.ts`:**

```
GET /events
```

---

## Application Structure

```
apps/kanban-ui/
├── project.json
├── tsconfig.json
├── tsconfig.app.json
├── public/
├── src/
│   ├── index.html
│   ├── main.ts
│   ├── styles.scss
│   └── app/
│       ├── app.component.ts
│       ├── app.config.ts
│       ├── app.routes.ts
│       ├── environments/
│       │   └── environment.ts
│       ├── models/
│       │   ├── task.model.ts          # TaskOut, TaskIn, TaskState enum
│       │   ├── activity.model.ts      # ActivityEntry, ActivityType
│       │   ├── history.model.ts       # StateHistory, HistoryResponse
│       │   ├── project.model.ts       # ProjectSummary
│       │   └── sse-event.model.ts     # SSEEvent union type
│       ├── services/
│       │   ├── kanban-api.service.ts  # All REST calls to the backend
│       │   └── kanban-sse.service.ts  # EventSource wrapper with RxJS subjects
│       ├── layout/
│       │   ├── shell.component.ts     # App shell: sidebar + project switcher
│       │   └── sidebar.component.ts
│       └── pages/
│           ├── board/
│           │   ├── board.component.ts
│           │   ├── board-column.component.ts
│           │   └── task-card.component.ts
│           ├── dashboard/
│           │   ├── dashboard.component.ts
│           │   ├── agent-card.component.ts
│           │   └── queue-panel.component.ts
│           └── task-detail/
│               ├── task-detail.component.ts
│               ├── history-timeline.component.ts
│               └── activity-feed.component.ts
```

---

## Pages & Views

### 1. Board View (`/board`)

The primary operational view.

```
┌──────────┬────────────┬─────────────────┬───────────┬──────────┬──────┐
│ BACKLOG  │    TODO    │   IN_PROGRESS   │  BLOCKED  │ IN_REVIEW│ DONE │
├──────────┼────────────┼─────────────────┼───────────┼──────────┼──────┤
│ [card]   │ [card]     │ [card]          │ [card]    │ [card]   │      │
│ [card]   │ [card]     │ ⏱ agent-1 12m  │           │          │      │
│          │ [card]     │                 │           │          │      │
└──────────┴────────────┴─────────────────┴───────────┴──────────┴──────┘
                                                              [+ New Task]
```

**Features:**
- Columns map 1:1 to task states.
- Each column shows a task count badge.
- Cards display: title, priority badge (`P1`–`P∞`), assignee chip (if set), dependency count warning icon, subtask progress (`2/5`).
- `IN_PROGRESS` cards show a live **elapsed time ticker** (derived from `assignedAt`), with a warning color when approaching the TTL threshold.
- **Drag-and-drop** between columns (PrimeNG CDK or `@angular/cdk/drag-drop`) triggers `POST /tasks/:id/transition`. Invalid drags are rejected client-side using the state machine transition table (mirrored in the frontend).
- **Quick actions on hover:** `[→ Move]` dropdown for valid transitions, `[🔒 Block]`, `[👁 View]`.
- Clicking a card navigates to `/tasks/:id`.
- **[+ New Task]** button opens a PrimeNG Dialog to `POST /tasks`.
- Column header context menus allow filtering the column (e.g. "Only my tasks").
- **Live via SSE**: `task_created`, `task_updated`, `task_deleted`, `task_expired` events patch the board state in-place without a full refetch.

**Task Card Component fields:**
```
┌─────────────────────────────────────────┐
│ P2  Fix login token refresh             │
│ ── ──────────────────────────────────── │
│ 2 deps · 3/5 subtasks · ⏱ 18m (agent-3) │
└─────────────────────────────────────────┘
```

### 2. Dashboard View (`/dashboard`)

Bird's-eye overview of all agent activity and what's coming up next.

#### 2a. Active Agents Panel

Shows every agent currently holding an `IN_PROGRESS` task within the selected project.

```
┌─────────────────────────────────────────────────────┐
│  ACTIVE AGENTS                               3 / 5  │
├─────────────────────────────────────────────────────┤
│  🤖 agent-copilot-1   [Fix login token refresh]     │
│     IN_PROGRESS  ●  22m elapsed  ████████░░  P2     │
│                                                     │
│  🤖 agent-copilot-3   [Implement dark mode]         │
│     IN_PROGRESS  ●  5m elapsed   █░░░░░░░░░  P4     │
│                                                     │
│  ⚠️ agent-copilot-7   [Write unit tests]             │
│     IN_PROGRESS  🔴 31m STALE — pending expiry  P1  │
└─────────────────────────────────────────────────────┘
```

- Entries update in real-time via SSE.
- Stale tasks (approaching/exceeding TTL) highlighted in amber/red.
- Clicking an agent row navigates to the task detail page.
- Shows a live elapsed time counter per agent.

#### 2b. Upcoming Queue Panel

Ordered list of the tasks that will be handed out next by `/tasks/next`, reflecting dependency eligibility and priority.

```
┌─────────────────────────────────────────────────────┐
│  NEXT UP (eligible TODO)                            │
├─────────────────────────────────────────────────────┤
│  #1  P1  Implement auth service                     │
│  #2  P2  Add message threading UI    (3 deps ✓)     │
│  #3  P3  Write integration tests                    │
│  ─────────────────────────────────────────────────  │
│  BLOCKED / WAITING                                  │
│  🔒 Write e2e tests  (waiting on: auth + threading) │
│  🔒 Deploy to staging  (waiting on: all tests)      │
└─────────────────────────────────────────────────────┘
```

- Eligible tasks sorted by priority then age.
- Blocked tasks shown below with inline dependency status.
- Updates live via SSE.

#### 2c. State Distribution Summary

Compact stat cards across the top of the dashboard.

```
┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌─────────┐ ┌──────────┐ ┌──────┐
│ BACKLOG  │ │   TODO   │ │ IN_PROGRESS │ │ BLOCKED │ │ IN_REVIEW│ │ DONE │
│    12    │ │    7     │ │      3      │ │    2    │ │    1     │ │  48  │
└──────────┘ └──────────┘ └─────────────┘ └─────────┘ └──────────┘ └──────┘
```

Sourced from `GET /projects` response. Clicking a card filters to that state.

### 3. Task Detail View (`/tasks/:id`)

Full detail page for a single task.

#### 3a. Task Header

Title, state badge, project tag, priority, assignee, created/updated timestamps. **Edit-in-place** for title, description, priority via `PATCH /tasks/:id`.

#### 3b. State Transition Controls

Inline action buttons for all valid next states based on the frontend-mirrored state machine:

```
Current: IN_PROGRESS
  [→ Submit for Review]  [🔒 Mark Blocked]  [↩ Back to TODO]
```

Clicking calls `POST /tasks/:id/transition`. Response updates the header.

#### 3c. State History Timeline

Visual timeline using PrimeNG Timeline component, sourced from `GET /tasks/:id/history`.

```
● Created             Mar 4, 10:00
  ↓ [BACKLOG: 5m]
● → TODO              Mar 4, 10:05
  ↓ [TODO: 8m]
● → IN_PROGRESS       Mar 4, 10:13    assigned to agent-3
  ↓ [IN_PROGRESS: 52m]
● → IN_REVIEW         Mar 4, 11:05
  ↓ [IN_REVIEW: ongoing…]
```

- Duration chips between waypoints (e.g. `5m`, `1h 22m`).
- Ongoing state shown with a pulsing indicator.
- Auto-expiry events flagged with ⚠️.

#### 3d. Activity Feed

Reverse-chronological feed sourced from `GET /tasks/:id/activity`, live-updated via `activity_added` SSE events.

Entry types rendered distinctly:
- `STATE_CHANGE` — state badge transition pill
- `ASSIGNMENT` — agent chip assigned/unassigned
- `DEPENDENCY` — dependency added/removed with linked task title
- `SUBTASK` — subtask added/removed with linked task title
- `COMMENT` — markdown-rendered comment bubble, author name, timestamp

**Comment composer** at the bottom:
```
┌──────────────────────────────────────────────┐
│ Add a comment…                               │
│                                              │
└──────────────────────────────────────────────┘
                                [Post as: agent-name] [Submit]
```

Calls `POST /tasks/:id/activity`.

#### 3e. Dependencies & Subtasks

Two collapsible panels:

**Dependencies:**
- List of tasks this task depends on, each showing state badge (green = DONE, red = blocking).
- `[+ Add dependency]` → searchable task picker dialog → `POST /tasks/:id/dependencies`.
- Remove button → `DELETE /tasks/:id/dependencies/:dependsOnId`.

**Subtasks:**
- Tree of child tasks with progress bar (`completed / total`).
- Clicking a subtask navigates to its detail page.
- `[+ Add subtask]` → inline quick-create (title only, inherits project + parentId).

---

## Services Layer

### `KanbanApiService`

Typed wrappers around every REST endpoint.

```ts
// Core CRUD
listTasks(filters?: TaskListFilters): Observable<TaskOut[]>
getTask(id: string): Observable<TaskOut>
createTask(body: TaskIn): Observable<TaskOut>
batchCreateTasks(body: BatchCreate): Observable<TaskOut[]>
patchTask(id: string, patch: TaskPatch): Observable<TaskOut>
deleteTask(id: string): Observable<void>

// State
transitionTask(id: string, state: TaskState): Observable<TaskOut>
nextTask(assignee: string, project: string): Observable<TaskOut>

// History & Activity
getTaskHistory(id: string): Observable<HistoryResponse>
getTaskActivity(id: string): Observable<ActivityEntry[]>
postComment(id: string, author: string, content: string): Observable<ActivityEntry>

// Dependencies
getTaskDependencies(id: string): Observable<TaskDependency[]>
addDependency(id: string, dependsOnId: string): Observable<TaskDependency>
removeDependency(id: string, dependsOnId: string): Observable<void>

// Subtasks
getSubtasks(id: string): Observable<TaskOut[]>

// Projects
listProjects(): Observable<ProjectSummary[]>
```

### `KanbanSseService`

Wraps the browser `EventSource` API as typed RxJS streams.

```ts
export class KanbanSseService {
  // Connects to GET /events?project=<project>
  // Manages one EventSource at a time; reconnects on error.
  connect(project?: string): void
  disconnect(): void

  // Typed event streams
  readonly taskUpdated$: Observable<SseTaskUpdated>
  readonly taskCreated$: Observable<SseTaskCreated>
  readonly taskDeleted$: Observable<SseTaskDeleted>
  readonly taskExpired$: Observable<SseTaskExpired>
  readonly activityAdded$: Observable<SseActivityAdded>
  readonly heartbeat$: Observable<SseHeartbeat>
  readonly connectionState$: Observable<'connected' | 'connecting' | 'disconnected'>
}
```

Components subscribe to these streams and apply patch updates to local signal state to avoid full re-renders.

### State Signal Architecture

Each page component holds an `@ngrx/signals` signal store or a hand-rolled computed signal graph:

```
Board:
  private tasks = signal<TaskOut[]>([])
  readonly columns = computed(() => groupByState(this.tasks()))

  constructor() {
    this.kanbanApi.listTasks({ project: this.project() })
      .subscribe(t => this.tasks.set(t));
    this.sse.taskUpdated$.subscribe(e =>
      this.tasks.update(list => list.map(t => t.id === e.payload.id ? e.payload : t))
    );
    this.sse.taskCreated$.subscribe(e =>
      this.tasks.update(list => [...list, e.payload])
    );
    this.sse.taskDeleted$.subscribe(e =>
      this.tasks.update(list => list.filter(t => t.id !== e.payload.id))
    );
  }
```

This ensures the board stays consistent with zero polling.

---

## State Machine Mirror (Client-Side)

The valid transitions are replicated in a frontend constant to drive button rendering and reject invalid drag-and-drop without a round-trip:

```ts
export const STATE_TRANSITIONS: Record<TaskState, TaskState[]> = {
  BACKLOG:     [TaskState.TODO],
  TODO:        [TaskState.IN_PROGRESS, TaskState.BACKLOG],
  IN_PROGRESS: [TaskState.IN_REVIEW, TaskState.BLOCKED, TaskState.TODO],
  BLOCKED:     [TaskState.TODO],
  IN_REVIEW:   [TaskState.DONE, TaskState.IN_PROGRESS],
  DONE:        [],
};
```

Invalid transitions are greyed out in the UI. Server-side validation remains the source of truth — client validation is UX-only.

---

## Routing

```
/                           → redirect to /board
/board                      → BoardComponent (project scope from query param ?project=)
/dashboard                  → DashboardComponent
/tasks/:id                  → TaskDetailComponent
```

Project is kept in the URL as a query param (`?project=chat-frontend`) and in an Angular `signal` via the `ShellComponent`. Changing project re-runs all data fetches and reconnects the SSE stream.

---

## UI / UX Details

### Project Switcher

Dropdown in the left sidebar. Sources options from `GET /projects`. Shows per-project breakdown (e.g. `chat-frontend (TODO: 3, IN_PROGRESS: 2, DONE: 14)`). Selected value stored in signal + URL query param.

### Connection Status Indicator

Small badge in the header showing SSE connection state:
- 🟢 Live — connected and receiving events
- 🟡 Reconnecting… — `EventSource` retry in progress
- 🔴 Offline — manual refresh required

### Priority Display

Integer priority displayed as:
- `P1` (priority ≤ 10) — red badge
- `P2` (priority ≤ 25) — orange badge
- `P3` (priority ≤ 50) — yellow badge
- `P4+` — grey badge

### Elapsed Time Tickers

For `IN_PROGRESS` tasks showing agent and elapsed time:
- Green: < 50% of TTL
- Amber: 50–90% of TTL
- Red: > 90% of TTL (or already stale)

Implemented with an `interval(1000)` piped through `takeUntilDestroyed()`.

### Drag-and-Drop

Uses Angular CDK `DragDropModule`. Each column is a `cdkDropList`. Constrained to valid successors via `cdkDropListConnectedTo` — only columns that are valid transition targets for a given card's current state are connected. On drop, `POST /tasks/:id/transition` is called. Optimistic UI update is applied immediately; reverted on API error with a toast.

---

## Create Task Dialog

Triggered from `[+ New Task]` on the board.

Fields:
- **Title** (required)
- **Description** (required, markdown textarea)
- **State** (default: `TODO`, select)
- **Priority** (number input, default: 100)
- **Parent Task** (optional, searchable select — queries `GET /tasks?project=…`)
- **Dependencies** (optional, multi-select searchable — queries `GET /tasks?project=…`)

Batch mode toggle: switch to a table editor where multiple tasks can be defined at once with inline `dependsOn` columns, submitted to `POST /tasks/batch`.

---

## Data Flow Summary

```
Browser
  ├── HTTP (Angular HttpClient)
  │     └── KanbanApiService ──→ REST endpoints on kanban service
  │
  └── SSE (EventSource)
        └── KanbanSseService ──→ GET /events?project=…
              │
              ├── taskCreated$  ──→ Board: insert card
              ├── taskUpdated$  ──→ Board: patch card, Dashboard: update agent row
              ├── taskDeleted$  ──→ Board: remove card
              ├── taskExpired$  ──→ Dashboard: flash agent row, Board: move card back to TODO
              ├── activityAdded$ ──→ TaskDetail: append activity entry
              └── heartbeat$    ──→ ConnectionStatus: pulse
```

---

## Backend Changes Required

Before building the UI, add to `apps/kanban`:

### 1. `apps/kanban/src/app/event-bus.ts`

```ts
import { EventEmitter } from 'events';
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(500); // support many SSE clients
```

### 2. Emit events from `TasksService`

After every mutation (create, update, transition, delete, expiry), emit on the bus:

```ts
eventBus.emit('task_updated', { type: 'task_updated', payload: task });
```

### 3. New SSE route in `tasks.router.ts`

```ts
fastify.get('/events', (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const { project } = req.query as { project?: string };

  const send = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const listener = (payload: SseEnvelope) => {
    if (!project || payload.payload?.project === project || payload.type === 'heartbeat') {
      send(payload.type, payload);
    }
  };

  eventBus.on('sse', listener);

  const heartbeat = setInterval(() => {
    send('heartbeat', { type: 'heartbeat', ts: new Date().toISOString() });
  }, 15_000);

  req.raw.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('sse', listener);
  });
});
```

### 4. CORS

Ensure the kanban service allows `GET /events` from the kanban-ui origin (already handled if CORS is configured as wildcard in dev).

---

## Implementation Steps

### Phase 1: Backend SSE Extension

1. Add `event-bus.ts` to `apps/kanban/src/app/`.
2. Import and emit to the bus from every mutation site in `tasks.service.ts` (create, patch, transition, delete, expiry cron).
3. Add `GET /events` SSE route to `tasks.router.ts`.
4. Test connection manually: `curl -N http://localhost:3333/events` and trigger a task update.

### Phase 2: Project Scaffold

5. Generate `apps/kanban-ui/` project following monorepo conventions (`project.json`, `tsconfig.*`).
6. Install dependencies: Angular, PrimeNG, `@primeuix/themes`, `@angular/cdk`.
7. Set up `app.config.ts` with `provideZonelessChangeDetection`, `providePrimeNG`, `provideRouter`, `provideHttpClient`.
8. Create `environments/` with API base URL config.

### Phase 3: Core Services

9. Implement `models/` types (mirror Zod schemas from backend as TypeScript interfaces).
10. Implement `KanbanApiService` with all REST methods.
11. Implement `KanbanSseService` with typed RxJS subjects and reconnection logic.

### Phase 4: Shell & Project Switcher

12. Implement `ShellComponent` with sidebar, project signal, and URL sync.
13. Implement `SidebarComponent` with nav links and project dropdown.
14. Add connection status indicator to the header.

### Phase 5: Board View

15. Implement `BoardComponent` — signal state, SSE subscriptions, column layout.
16. Implement `BoardColumnComponent` — CDK drop list, column header with count badge.
17. Implement `TaskCardComponent` — priorities, assignee chip, elapsed ticker, quick actions.
18. Wire drag-and-drop with state machine constraints.
19. Implement "New Task" dialog.

### Phase 6: Dashboard View

20. Implement `DashboardComponent` — layout, state summary stat cards.
21. Implement `AgentCardComponent` — elapsed ticker, stale warning, TTL progress bar.
22. Implement `QueuePanelComponent` — upcoming tasks, blocked tasks with dep status.

### Phase 7: Task Detail View

23. Implement `TaskDetailComponent` — header, edit-in-place, transition controls.
24. Implement `HistoryTimelineComponent` — PrimeNG Timeline, duration chips.
25. Implement `ActivityFeedComponent` — typed entry renderers, comment composer.
26. Implement dependencies panel with add/remove.
27. Implement subtasks panel with progress and quick-create.

### Phase 8: Polish

28. Responsive layout (mobile: stacked board columns as accordion tabs).
29. Dark mode toggle (PrimeNG `darkModeSelector: '.dark-mode'`).
30. Empty states and loading skeletons for all async views.
31. Toast notifications for all API errors and optimistic rollbacks.

---

## Environment Variables

| Variable         | Default                 | Description                    |
| ---------------- | ----------------------- | ------------------------------ |
| `KANBAN_API_URL` | `http://localhost:3333` | Base URL of the kanban service |

Set in `src/app/environments/environment.ts`.

---

## Key Design Decisions

| Decision                  | Choice                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Real-time mechanism       | SSE (not WebSockets) — read-only push; mutations remain REST                                       |
| State management          | Angular signals + computed — no NgRx; consistent with other frontends                              |
| SSE reconnection          | Browser `EventSource` handles automatic reconnect; `KanbanSseService` resets subjects on reconnect |
| Drag-and-drop             | Angular CDK — already in PrimeNG's peer deps; constrained to valid state transitions               |
| Optimistic updates        | Applied on drag; rolled back on API error with PrimeNG toast                                       |
| Client-side state machine | Mirrors backend table — UX only, server is authoritative                                           |
| Project scoping           | Single project context per session; stored in query param so URLs are shareable                    |
| Elapsed tickers           | `interval(1000)` + `takeUntilDestroyed()` per card; derived from `assignedAt`                      |
| Board refresh strategy    | Full fetch on mount + SSE patch thereafter; no polling                                             |
