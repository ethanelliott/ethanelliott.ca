import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownService } from '../../services/markdown.service';
import { MessageService } from 'primeng/api';

const SKILL_MD = `# Kanban Service — LLM Skill Reference

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
BACKLOG ──► TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
              ▲           │
              │           ▼
              └──── BLOCKED
\`\`\`

| From | Allowed transitions |
|------|---------------------|
| BACKLOG | TODO |
| TODO | IN_PROGRESS, BACKLOG |
| IN_PROGRESS | IN_REVIEW, BLOCKED, TODO |
| BLOCKED | TODO |
| IN_REVIEW | DONE, IN_PROGRESS |
| DONE | *(terminal)* |

> **Note:** Transitioning to TODO or BACKLOG automatically clears the assignee.

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

This atomically selects the highest-priority \`TODO\` task in the project,
assigns it to you, and transitions it to \`IN_PROGRESS\` — all in one request.

**Response (200):** The full task object, now \`IN_PROGRESS\` with your assignee set.
**Response (404):** \`{ "message": "No eligible tasks available" }\` — nothing ready.

> Before calling \`/tasks/next\`, tasks must be in \`TODO\` state. Tasks start in
> \`BACKLOG\` and must be promoted to \`TODO\` before they can be claimed.

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
  "body": "Investigated the issue — root cause is in the auth module."
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
POST /tasks/<id>/activity  { "author": "<me>", "body": "<note>" }

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
          LLM Skill Reference
        </h2>
        <button class="copy-btn" type="button" (click)="copy()">
          @if (copied()) {
          <i class="pi pi-check"></i> Copied! } @else {
          <i class="pi pi-copy"></i> Copy Markdown }
        </button>
      </div>
      <article class="md-content skill-body" [innerHTML]="rendered"></article>
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
      margin-bottom: 24px;
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

  readonly rendered = this.md.render(SKILL_MD);
  readonly copied = signal(false);

  copy(): void {
    navigator.clipboard.writeText(SKILL_MD).then(() => {
      this.copied.set(true);
      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Markdown copied to clipboard',
        life: 2000,
      });
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
