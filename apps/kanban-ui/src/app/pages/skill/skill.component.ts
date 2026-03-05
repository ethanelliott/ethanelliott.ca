import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownService } from '../../services/markdown.service';
import { MessageService } from 'primeng/api';

// ---------------------------------------------------------------------------
// Skill file definitions
// ---------------------------------------------------------------------------

interface SkillFile {
  id: string;
  label: string;
  icon: string;
  markdown: string;
}

// ---------------------------------------------------------------------------
// Full Reference (existing skill, updated state machine)
// ---------------------------------------------------------------------------

const FULL_REFERENCE_MD = `# Kanban Service — LLM Skill Reference

This document describes how to use the Kanban task-management service as an LLM
agent. Follow the workflow below to claim work, update progress, and mark tasks
complete.

---

## Base URL

All endpoints are relative to the service root. If you are running locally the
default is \`http://localhost:3333\`. In production the UI and API are co-located
so you can use a relative base.

---

## Core Concepts

| Term | Meaning |
|------|---------|
| **Task** | The unit of work. Has a title, description, state, priority, project, and optional assignee. |
| **Project** | A logical namespace for tasks. Passed as a string (e.g. \`"my-project"\`). |
| **State** | Where a task is in its lifecycle. See the state machine below. |
| **Priority** | Integer — **lower = higher priority** (1 is most urgent, 9999 is least). |
| **Assignee** | Free-form string identifying who owns the task (e.g. your model name / agent ID). |
| **SSE** | Server-Sent Events stream at \`GET /tasks/events\` pushes real-time updates. |

---

## State Machine

\`\`\`
                                    CHANGES_REQUESTED
                                      ▲           │
                                      │           ▼
BACKLOG ──► TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
              ▲           │                          │
              │           ▼                          │
              └──── BLOCKED            ◄─────────────┘
\`\`\`

| From | Allowed transitions |
|------|---------------------|
| BACKLOG | TODO |
| TODO | IN_PROGRESS, BACKLOG |
| IN_PROGRESS | IN_REVIEW, BLOCKED, TODO |
| BLOCKED | TODO |
| IN_REVIEW | DONE, IN_PROGRESS, CHANGES_REQUESTED |
| CHANGES_REQUESTED | IN_PROGRESS |
| DONE | CHANGES_REQUESTED |

> **Note:** Transitioning to TODO, BACKLOG, or CHANGES_REQUESTED automatically
> clears the assignee.

---

## Workflow: Taking and Completing a Task

### Step 1 — Find available work

\`\`\`http
POST /tasks/next
Content-Type: application/json

{
  "assignee": "my-agent",
  "project": "my-project"
}
\`\`\`

This atomically selects the highest-priority \`TODO\` (or \`CHANGES_REQUESTED\`)
task in the project, assigns it to you, and transitions it to \`IN_PROGRESS\` —
all in one request.

**Response (200):** The full task object, now \`IN_PROGRESS\` with your assignee set.
**Response (404):** \`{ "message": "No eligible tasks available" }\` — nothing ready.

> Before calling \`/tasks/next\`, tasks must be in \`TODO\` or \`CHANGES_REQUESTED\`
> state. Tasks start in \`BACKLOG\` and must be promoted to \`TODO\` before they
> can be claimed.

---

### Step 2 — Read the task details

\`\`\`http
GET /tasks/{id}
\`\`\`

Returns the full task. Check \`description\` for the spec, \`depCount\` for
blocking dependencies, and \`subtaskCount\` for child tasks to complete first.

**Fetch dependencies (if depCount > 0):**

\`\`\`http
GET /tasks/{id}/dependencies
\`\`\`

Returns an array of \`{ id, taskId, dependsOnId }\`. Fetch each \`dependsOnId\`
individually and ensure they are \`DONE\` before proceeding.

**Fetch subtasks (if subtaskCount > 0):**

\`\`\`http
GET /tasks/{id}/subtasks
\`\`\`

Returns child tasks. Work through them in priority order before marking the
parent complete.

---

### Step 3 — Post progress notes (optional but recommended)

\`\`\`http
POST /tasks/{id}/activity
Content-Type: application/json

{
  "author": "my-agent",
  "content": "Investigated the issue — root cause is in the auth module."
}
\`\`\`

Adds a comment to the activity feed. Use this to leave notes for humans
reviewing your work, or to record reasoning steps.

---

### Step 4 — If blocked, signal it

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "BLOCKED" }
\`\`\`

Post an activity comment explaining what is blocking you before transitioning.

To unblock later:

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "TODO" }
\`\`\`

*(This clears the assignee — you will need to re-claim via \`/tasks/next\`.)*

---

### Step 5 — Submit for review

When your work is ready for human or CI review:

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "IN_REVIEW" }
\`\`\`

Leave a detailed activity comment summarising what you did and any caveats.

---

### Step 6 — Mark complete (or return to in-progress)

If you are authorised to sign off your own work:

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "DONE" }
\`\`\`

If review fails and work must continue:

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "IN_PROGRESS" }
\`\`\`

If work was marked DONE but changes are needed, move it back:

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "CHANGES_REQUESTED" }
\`\`\`

---

## Other Useful Endpoints

### List tasks

\`\`\`http
GET /tasks?project=my-project&state=TODO&priorityMax=50
\`\`\`

Query parameters: \`project\`, \`state\`, \`assignee\`, \`priorityMin\`, \`priorityMax\`,
\`createdAfter\`, \`createdBefore\`, \`search\`.

---

### Create a task

\`\`\`http
POST /tasks
Content-Type: application/json

{
  "title": "Implement login flow",
  "description": "Use JWT. See designs in Figma link …",
  "project": "my-project",
  "priority": 10,
  "parentId": null
}
\`\`\`

Newly created tasks start in \`BACKLOG\`. Promote to \`TODO\` before claiming.

---

### Batch-create tasks

\`\`\`http
POST /tasks/batch
Content-Type: application/json

{
  "project": "my-project",
  "tasks": [
    {
      "title": "Design schema",
      "description": "ERD for the new tables",
      "priority": 1,
      "state": "TODO"
    },
    {
      "title": "Implement migrations",
      "description": "Run after schema is approved",
      "priority": 2,
      "state": "BACKLOG",
      "dependsOn": [0]
    }
  ]
}
\`\`\`

\`dependsOn\` is an array of **indices** into the same batch array. The service
links the dependencies automatically.

---

### Patch a task (edit fields without state change)

\`\`\`http
PATCH /tasks/{id}
Content-Type: application/json

{
  "title": "Updated title",
  "description": "Revised spec",
  "priority": 5,
  "assignee": "my-agent"
}
\`\`\`

All fields optional. Does not affect state.

---

### Delete a task

\`\`\`http
DELETE /tasks/{id}
\`\`\`

Soft-deletes the task. SSE emits \`task_deleted\`.

---

### Get state history

\`\`\`http
GET /tasks/{id}/history
\`\`\`

Returns \`{ transitions: [...], durations: { STATE: ms | null } }\`.
Useful for reporting how long a task spent in each state.

---

### List projects

\`\`\`http
GET /projects
\`\`\`

Returns project summaries with per-state counts. Projects are auto-discovered
from existing tasks — there is no separate project-creation endpoint.

---

## Real-time Events (SSE)

\`\`\`http
GET /tasks/events?project=my-project
\`\`\`

Keeps an open connection and receives events as newline-delimited
\`event: <type>\\ndata: <json>\\n\\n\` frames:

| Event type | Payload |
|-----------|---------|
| \`task_created\` | Full task object |
| \`task_updated\` | Full task object |
| \`task_deleted\` | \`{ id, project }\` |
| \`task_expired\` | Task that was auto-returned to TODO after timeout |
| \`activity_added\` | Activity entry |
| \`heartbeat\` | \`{ type, ts }\` every 15 s |

SSE is optional for agents but useful for polling-free coordination between
multiple agents on the same project.

---

## Quick-Reference Cheat Sheet

\`\`\`
# See what needs doing
GET  /tasks?project=<p>&state=TODO

# Claim the next task (atomic)
POST /tasks/next  { "assignee": "<me>", "project": "<p>" }

# Read full details
GET  /tasks/<id>
GET  /tasks/<id>/subtasks
GET  /tasks/<id>/dependencies

# Leave a note
POST /tasks/<id>/activity  { "author": "<me>", "content": "<note>" }

# Advance state
POST /tasks/<id>/transition  { "state": "IN_REVIEW" }
POST /tasks/<id>/transition  { "state": "DONE" }

# Create new work
POST /tasks  { "title": "…", "description": "…", "project": "<p>", "priority": 100 }
POST /tasks/batch  { "project": "<p>", "tasks": [ … ] }
\`\`\`

---

## Tips for Agents

- **Always post an activity comment** before and after doing meaningful work.
  Humans read these; they are your audit trail.
- **Check \`depCount\`** before starting. If > 0, the task has unresolved
  dependencies — verify they are all \`DONE\` first.
- **Use \`priority\`** to indicate urgency. Lower numbers are worked first by
  \`/tasks/next\`. If you spawn subtasks, number them so they are claimed in the
  right order.
- **\`/tasks/next\` is idempotent per assignee** in spirit — if you call it twice
  with the same assignee you just get two tasks. Do not double-claim unless you
  intend to work both concurrently.
- **Heartbeat timeout:** IN_PROGRESS tasks that have not been updated
  in 30 minutes are automatically expired back to TODO via a background cron.
  Post an activity comment or PATCH \`updatedAt\` (via any PATCH) to keep your
  claim alive.
`;

// ---------------------------------------------------------------------------
// Task Creator Agent
// ---------------------------------------------------------------------------

const TASK_CREATOR_MD = `# Task Creator Agent — Skill Reference

You are a task-planning agent. Your job is to break down work into well-defined
tasks, create them in the kanban service, and set up their relationships
(dependencies, subtasks, priority ordering).

---

## Base URL

Default: \`http://localhost:3333\`. All endpoints below are relative to this.

---

## Core Concepts

| Term | Meaning |
|------|---------|
| **Task** | Unit of work with title, description, state, priority, project. |
| **Project** | Logical namespace (string). All tasks in a batch must share a project. |
| **Priority** | Integer — **lower = more urgent**. Use to control work order. |
| **Dependency** | Task A depends on Task B = B must be DONE before A can start. |
| **Subtask** | A child task linked via \`parentId\`. Parent cannot be marked DONE until all subtasks are DONE. |
| **State** | New tasks default to \`BACKLOG\`. Set to \`TODO\` to make them immediately claimable. |

---

## Creating a Single Task

\`\`\`http
POST /tasks
Content-Type: application/json

{
  "title": "Implement user authentication",
  "description": "Add JWT-based auth with refresh tokens. Must support OAuth2 providers.",
  "project": "my-project",
  "priority": 10,
  "state": "TODO"
}
\`\`\`

### Fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| \`title\` | yes | — | Short, actionable summary |
| \`description\` | no | \`""\` | Detailed spec, acceptance criteria, context |
| \`project\` | yes | — | Must match the target project name |
| \`priority\` | no | \`100\` | Lower = higher priority. Use 1-10 for critical, 10-50 for normal, 50+ for low |
| \`state\` | no | \`BACKLOG\` | Set to \`TODO\` if the task is ready to be claimed immediately |
| \`parentId\` | no | \`null\` | UUID of parent task (creates a subtask relationship) |

---

## Batch-Creating Tasks (Recommended)

Use batch create when you have multiple related tasks. This is the preferred
approach because it lets you define **dependencies between tasks in the same
batch** using array indices.

\`\`\`http
POST /tasks/batch
Content-Type: application/json

{
  "project": "my-project",
  "tasks": [
    {
      "title": "Design database schema",
      "description": "Create ERD for users, sessions, and tokens tables.",
      "priority": 1,
      "state": "TODO"
    },
    {
      "title": "Write migration scripts",
      "description": "Implement the schema from task 0 as SQL migrations.",
      "priority": 2,
      "state": "TODO",
      "dependsOn": [0]
    },
    {
      "title": "Implement auth endpoints",
      "description": "POST /login, POST /register, POST /refresh, POST /logout",
      "priority": 3,
      "state": "TODO",
      "dependsOn": [1]
    },
    {
      "title": "Write integration tests",
      "description": "Test all auth endpoints with valid and invalid inputs.",
      "priority": 4,
      "state": "TODO",
      "dependsOn": [2]
    }
  ]
}
\`\`\`

### Batch Fields

| Field | Notes |
|-------|-------|
| \`project\` | Applied to all tasks in the batch |
| \`tasks\` | Array of task objects (same fields as single create) |
| \`tasks[].dependsOn\` | Array of **zero-based indices** into the same \`tasks\` array. The service creates dependency links automatically. |

### How Dependencies Work

- \`"dependsOn": [0]\` means "this task depends on the task at index 0 in this batch"
- A task with unresolved dependencies will be auto-blocked — \`/tasks/next\` skips it
- When all dependencies reach \`DONE\`, the blocked task is automatically unblocked

---

## Creating Subtasks

Subtasks are tasks linked to a parent via \`parentId\`. The parent task cannot
be moved to \`DONE\` until all subtasks are \`DONE\`.

\`\`\`http
POST /tasks
Content-Type: application/json

{
  "title": "Implement login endpoint",
  "description": "POST /login with email + password",
  "project": "my-project",
  "priority": 1,
  "parentId": "uuid-of-parent-task",
  "state": "TODO"
}
\`\`\`

> **Note:** Subtasks must belong to the same project as their parent.

---

## Managing Dependencies After Creation

### Add a dependency

\`\`\`http
POST /tasks/{taskId}/dependencies
Content-Type: application/json

{ "dependsOnId": "uuid-of-dependency" }
\`\`\`

### Remove a dependency

\`\`\`http
DELETE /tasks/{taskId}/dependencies/{dependsOnId}
\`\`\`

### List dependencies

\`\`\`http
GET /tasks/{taskId}/dependencies
\`\`\`

---

## Promoting Tasks to TODO

Tasks created in \`BACKLOG\` must be moved to \`TODO\` before workers can claim them:

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "TODO" }
\`\`\`

---

## Patching Existing Tasks

Update any field without changing state:

\`\`\`http
PATCH /tasks/{id}
Content-Type: application/json

{
  "title": "Updated title",
  "description": "Revised acceptance criteria",
  "priority": 5
}
\`\`\`

---

## Listing Existing Tasks

Check what already exists before creating duplicates:

\`\`\`http
GET /tasks?project=my-project
GET /tasks?project=my-project&state=TODO
GET /tasks?project=my-project&search=authentication
\`\`\`

Query parameters: \`project\`, \`state\`, \`assignee\`, \`priorityMin\`, \`priorityMax\`,
\`createdAfter\`, \`createdBefore\`, \`search\`.

---

## Best Practices

- **Write clear descriptions.** The worker agent's only context is the task
  title and description. Include acceptance criteria, links, and constraints.
- **Use priority to control order.** Workers claim the lowest-priority-number
  task first. Number sequential tasks 1, 2, 3… so they are worked in order.
- **Prefer batch create** for related work. It's one API call and handles
  dependency wiring automatically.
- **Use dependencies, not just priority,** to enforce ordering. Priority is a
  hint; dependencies are a hard constraint (\`/tasks/next\` won't serve a task
  with unmet dependencies).
- **Set state to TODO** for tasks that are ready. Leave as \`BACKLOG\` for tasks
  that need further refinement or are intentionally held back.
- **Leave activity comments** when creating complex task structures to explain
  the rationale for the breakdown.

---

## Quick-Reference Cheat Sheet

\`\`\`
# Create one task
POST /tasks  { "title": "…", "description": "…", "project": "<p>", "priority": 10, "state": "TODO" }

# Create many tasks with dependencies
POST /tasks/batch  { "project": "<p>", "tasks": [ { ..., "dependsOn": [0] }, ... ] }

# Create a subtask
POST /tasks  { ..., "parentId": "<parent-uuid>" }

# Add a dependency after creation
POST /tasks/<id>/dependencies  { "dependsOnId": "<dep-uuid>" }

# Promote to TODO
POST /tasks/<id>/transition  { "state": "TODO" }

# Check existing work
GET  /tasks?project=<p>&search=<keyword>

# Leave a note
POST /tasks/<id>/activity  { "author": "creator-agent", "content": "<note>" }
\`\`\`
`;

// ---------------------------------------------------------------------------
// Worker Agent
// ---------------------------------------------------------------------------

const WORKER_AGENT_MD = `# Worker Agent — Skill Reference

You are a worker agent. Your job is to claim tasks from the kanban board,
do the work described in the task, and move it through to completion.

---

## Base URL

Default: \`http://localhost:3333\`. All endpoints below are relative to this.

---

## State Machine

Tasks flow through these states:

\`\`\`
                                CHANGES_REQUESTED
                                  ▲           │
                                  │           ▼
TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
  ▲           │                          │
  │           ▼                          │
  └──── BLOCKED            ◄─────────────┘
\`\`\`

Your typical workflow: **TODO -> IN_PROGRESS -> IN_REVIEW -> DONE**.

If changes are requested after review or completion, the task moves to
\`CHANGES_REQUESTED\`. When you call \`/tasks/next\`, these are **prioritized
over TODO tasks** — you will pick them up automatically.

---

## Workflow

### 1. Claim the next task

\`\`\`http
POST /tasks/next
Content-Type: application/json

{
  "assignee": "your-agent-id",
  "project": "my-project"
}
\`\`\`

This atomically finds the highest-priority claimable task, assigns it to you,
and moves it to \`IN_PROGRESS\`. You will receive the full task object.

**200** — Task claimed. Start working.
**404** — No tasks available. Wait and retry later.
**409** — You already have an \`IN_PROGRESS\` task in this project. Finish it first.

---

### 2. Read the task

\`\`\`http
GET /tasks/{id}
\`\`\`

Read the \`description\` carefully — it contains the full spec. Also check:

- **\`depCount\`** — If > 0, fetch dependencies and verify they are all DONE
- **\`subtaskCount\`** — If > 0, complete subtasks first

\`\`\`http
GET /tasks/{id}/dependencies
GET /tasks/{id}/subtasks
\`\`\`

---

### 3. Do the work

Post activity comments as you make progress:

\`\`\`http
POST /tasks/{id}/activity
Content-Type: application/json

{
  "author": "your-agent-id",
  "content": "Starting implementation. Found the relevant module at src/auth/..."
}
\`\`\`

---

### 4. If blocked, say so

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "BLOCKED" }
\`\`\`

Always post an activity comment explaining the blocker **before** transitioning.

---

### 5. Submit for review

When the work is complete:

\`\`\`http
POST /tasks/{id}/activity
Content-Type: application/json

{
  "author": "your-agent-id",
  "content": "Implementation complete. Added JWT auth with refresh tokens. Tests passing."
}
\`\`\`

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "IN_REVIEW" }
\`\`\`

---

### 6. Mark done (if authorized) or wait for review

\`\`\`http
POST /tasks/{id}/transition
Content-Type: application/json

{ "state": "DONE" }
\`\`\`

---

## Handling CHANGES_REQUESTED

A reviewer can move a task to \`CHANGES_REQUESTED\` from either \`IN_REVIEW\` or
\`DONE\`. When this happens:

1. The assignee is cleared — the task is back in the pool
2. \`/tasks/next\` prioritizes \`CHANGES_REQUESTED\` tasks over \`TODO\` tasks
3. You will automatically pick it up on your next \`/tasks/next\` call

When you receive a \`CHANGES_REQUESTED\` task, **read the activity feed first**
to understand what changes are needed:

\`\`\`http
GET /tasks/{id}/activity
\`\`\`

Then proceed with the normal workflow: do the work, post progress notes,
and submit for review again.

---

## Important Rules

- **One task at a time** per project. \`/tasks/next\` returns 409 if you already
  have an IN_PROGRESS task. Finish or release your current task first.
- **Expiry timeout:** IN_PROGRESS tasks are auto-expired back to TODO after
  30 minutes of inactivity. Post activity comments or patch the task to keep
  your claim alive.
- **Always leave an activity trail.** Post a comment before starting, when
  hitting milestones, and when submitting for review. Humans read these.

---

## Quick-Reference Cheat Sheet

\`\`\`
# Claim work
POST /tasks/next  { "assignee": "<me>", "project": "<p>" }

# Read the task
GET  /tasks/<id>
GET  /tasks/<id>/dependencies
GET  /tasks/<id>/subtasks

# Post progress
POST /tasks/<id>/activity  { "author": "<me>", "content": "<note>" }

# Move forward
POST /tasks/<id>/transition  { "state": "IN_REVIEW" }
POST /tasks/<id>/transition  { "state": "DONE" }

# If stuck
POST /tasks/<id>/transition  { "state": "BLOCKED" }
\`\`\`
`;

// ---------------------------------------------------------------------------
// Skill file registry
// ---------------------------------------------------------------------------

const SKILL_FILES: SkillFile[] = [
  {
    id: 'full-reference',
    label: 'Full Reference',
    icon: 'pi-book',
    markdown: FULL_REFERENCE_MD,
  },
  {
    id: 'task-creator',
    label: 'Task Creator',
    icon: 'pi-plus-circle',
    markdown: TASK_CREATOR_MD,
  },
  {
    id: 'worker-agent',
    label: 'Worker Agent',
    icon: 'pi-cog',
    markdown: WORKER_AGENT_MD,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-skill',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skill-page">
      <div class="skill-toolbar">
        <h2 class="skill-heading">
          <i class="pi pi-book"></i>
          Skill Files
        </h2>
        <button class="copy-btn" type="button" (click)="copy()">
          @if (copied()) {
          <i class="pi pi-check"></i> Copied! } @else {
          <i class="pi pi-copy"></i> Copy Markdown }
        </button>
      </div>

      <div class="tab-bar">
        @for (sf of skillFiles; track sf.id) {
        <button
          class="tab-btn"
          type="button"
          [class.active]="activeId() === sf.id"
          (click)="activeId.set(sf.id)"
        >
          <i class="pi {{ sf.icon }}"></i>
          {{ sf.label }}
        </button>
        }
      </div>

      <article class="md-content skill-body" [innerHTML]="rendered()"></article>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }

    .skill-page {
      max-width: 860px;
      margin: 0 auto;
      padding: 28px 24px 60px;
    }

    .skill-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .skill-heading {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--p-text-color);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;

      i { color: var(--p-primary-color); }
    }

    .copy-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 16px;
      border-radius: 8px;
      border: 1px solid var(--p-surface-600);
      background: var(--p-surface-800);
      color: var(--p-text-muted-color);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
        background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
      }
    }

    .tab-bar {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--p-surface-700);
      padding-bottom: 0;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      border: none;
      border-bottom: 2px solid transparent;
      background: none;
      color: var(--p-text-muted-color);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      margin-bottom: -1px;

      i { font-size: 0.85rem; }

      &:hover {
        color: var(--p-text-color);
        background: color-mix(in srgb, var(--p-surface-600) 30%, transparent);
      }

      &.active {
        color: var(--p-primary-color);
        border-bottom-color: var(--p-primary-color);
      }
    }

    .skill-body {
      line-height: 1.75;
      color: var(--p-text-color);

      h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 8px; color: var(--p-text-color); }
      h2 { font-size: 1.2rem; font-weight: 600; margin: 32px 0 10px; color: var(--p-text-color);
           border-bottom: 1px solid var(--p-surface-700); padding-bottom: 6px; }
      h3 { font-size: 1rem; font-weight: 600; margin: 24px 0 8px; color: var(--p-primary-color); }

      p { margin: 0 0 12px; }

      a { color: var(--p-primary-color); text-decoration: underline; }

      code {
        background: var(--p-surface-800);
        border: 1px solid var(--p-surface-600);
        border-radius: 4px;
        padding: 1px 5px;
        font-size: 0.83em;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        color: #a5f3fc;
      }

      pre {
        background: var(--p-surface-900);
        border: 1px solid var(--p-surface-700);
        border-radius: 8px;
        padding: 14px 16px;
        overflow-x: auto;
        margin: 0 0 16px;

        code {
          background: none;
          border: none;
          padding: 0;
          font-size: 0.82rem;
          color: #e2e8f0;
        }
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 16px;
        font-size: 0.875rem;

        th {
          background: var(--p-surface-800);
          padding: 8px 12px;
          text-align: left;
          font-weight: 600;
          border: 1px solid var(--p-surface-600);
          color: var(--p-text-color);
        }

        td {
          padding: 7px 12px;
          border: 1px solid var(--p-surface-700);
          vertical-align: top;
          color: var(--p-text-muted-color);
        }

        tr:nth-child(even) td { background: var(--p-surface-900); }
      }

      blockquote {
        border-left: 3px solid var(--p-primary-color);
        margin: 0 0 16px;
        padding: 6px 14px;
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
        border-radius: 0 6px 6px 0;
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
      }

      hr {
        border: none;
        border-top: 1px solid var(--p-surface-700);
        margin: 28px 0;
      }

      ul, ol {
        padding-left: 24px;
        margin: 0 0 12px;
        li { margin-bottom: 4px; }
      }

      strong { color: var(--p-text-color); font-weight: 600; }
    }
  `,
})
export class SkillComponent {
  private readonly md = inject(MarkdownService);
  private readonly messageService = inject(MessageService);

  readonly skillFiles = SKILL_FILES;
  readonly activeId = signal(SKILL_FILES[0].id);
  readonly copied = signal(false);

  private readonly activeSkill = computed(
    () => SKILL_FILES.find((sf) => sf.id === this.activeId()) ?? SKILL_FILES[0]
  );

  readonly rendered = computed(() =>
    this.md.render(this.activeSkill().markdown)
  );

  copy(): void {
    const markdown = this.activeSkill().markdown;
    navigator.clipboard.writeText(markdown).then(() => {
      this.copied.set(true);
      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: `${this.activeSkill().label} markdown copied to clipboard`,
        life: 2000,
      });
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
