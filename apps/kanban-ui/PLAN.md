# Kanban UI Plan

## Overview

Two deliverables on top of the existing `apps/kanban` backend:

1. **`apps/kanban-ui/`** — Angular 21 + PrimeNG frontend, served by the Fastify backend at `/ui/**`
2. **`apps/kanban-tauri/`** — Tauri v2 desktop wrapper that bundles the Fastify server as a sidecar binary; produces a single installer (`.dmg` / `.exe` / `.AppImage`) with no bundled Chromium (uses OS webview)

## Architecture

```
+------------------- Tauri shell (Rust) --------------------+
|                                                            |
|   tauri::Builder                                           |
|     +- spawn sidecar:  dist/kanban-server (SEA binary)     |
|     |    reads PORT:{n} from sidecar stdout                |
|     +- create WebviewWindow                                |
|          http://127.0.0.1:{port}/ui/                       |
|                                                            |
|      +-------------- sidecar ---------------+              |
|      |  Node.js SEA — Fastify server        |              |
|      |    GET /projects                     |              |
|      |    GET/POST/PATCH/DELETE /tasks/**   |              |
|      |    GET /ui/**  (Angular static)      |              |
|      |    SQLite via sql.js (WASM, no .node)|              |
|      +---------------------------------------------+       |
+------------------------------------------------------------+
```

**Development setup**: `bun nx serve kanban` (port 3333) + `bun nx serve kanban-ui` (port 4200 with proxy). No Tauri needed during normal UI development.

## Design Decisions

| Decision                       | Choice                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API prefix on backend          | All API routes remain at `/tasks`, `/projects` (no `/api` prefix). Angular calls same-origin.                                                                                        |
| UI route on backend            | `@fastify/static` serves Angular dist at `/ui/**`. Redirect `/` to `/ui/`.                                                                                                           |
| Angular `base-href`            | Set to `/ui/` at build time (`--base-href /ui/`).                                                                                                                                    |
| Real-time updates              | **Server-Sent Events (SSE)** — backend emits typed events on every mutation; Angular subscribes via `EventSource` wrapped in an RxJS `Observable`. No polling, no WebSocket handshake overhead. |
| Tauri sidecar port selection   | Fastify picks a free port and prints `PORT:{port}` to stdout. The Rust main reads this and passes it to `WebviewWindow::url()`.                                                      |
| Tauri data directory           | DB path from `app.path().app_data_dir()` — e.g. `~/Library/Application Support/ca.ethanelliott.kanban/kanban.db` on macOS.                                                          |
| Tauri IPC                      | Minimal — port communicated via sidecar stdout. Angular uses `window.location.origin` so no IPC needed for the base URL.                                                             |
| SQLite driver                  | **sql.js** (SQLite compiled to WASM). TypeORM `type: 'sqljs'` with `autoSave: true`. Zero native `.node` files — no rebuild step, works cleanly with Node.js SEA sidecar packaging. |
| Tauri packaging                | `tauri build`: `dmg`/`zip` (macOS), `nsis`/`msi` (Windows), `deb`/`AppImage` (Linux). ~5-15 MB installer (no bundled Chromium).                                                     |
| Angular conventions            | Match the rest of the repo: standalone, zoneless, OnPush, signals, inline templates, `inject()`.                                                                                     |
| PrimeNG theme                  | **Aura Dark** (same as `chat-frontend` and `recipes-frontend`).                                                                                                                      |
| Task auto-refresh              | SSE `Observable` + `takeUntilDestroyed` in each component. On SSE reconnect the component re-fetches the initial HTTP snapshot, then streams deltas.                                  |

---

## Part 1 — Backend Changes (`apps/kanban`)

### 1.1 Add `@fastify/static` to serve the Angular app

In `app.ts`, after registering the API routers:

```ts
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const uiDistPath = join(__dirname, '..', 'ui');

await fastify.register(fastifyStatic, {
  root: uiDistPath,
  prefix: '/ui/',
  decorateReply: false,
});

fastify.get('/ui/*', (_, reply) => {
  reply.sendFile('index.html', uiDistPath);
});

fastify.get('/', (_, reply) => {
  reply.redirect('/ui/');
});
```

The Angular dist is copied into `dist/apps/kanban/ui/` by the build pipeline (see §3.7).

### 1.2 Print port to stdout (for Tauri sidecar detection)

In `main.ts`, after the server starts:

```ts
console.log(`PORT:${address.port}`);
```

Tauri reads this from the sidecar's stdout to open the WebviewWindow at the correct URL. In Docker/K8s deploys this line is harmlessly ignored.

### 1.3 Switch SQLite driver to sql.js

Change `data-source.ts` to use the pure-WASM sql.js driver instead of better-sqlite3:

```ts
const isProduction = process.env['NODE_ENV'] === 'production';
const dbPath =
  process.env['DB_PATH'] ??
  (isProduction ? '/app/data/kanban.db' : 'kanban.db');

export const AppDataSource = new DataSource({
  type: 'sqljs',
  location: dbPath,
  autoSave: true,
  useLocalForage: false,   // Node.js: filesystem, not localStorage
  synchronize: true,
  logging: !isProduction,
  entities: [/* injected via multi-token ENTITIES */],
});
```

**Why sql.js over better-sqlite3:**

|                             | better-sqlite3             | sql.js           |
| --------------------------- | -------------------------- | ---------------- |
| Native `.node` binding      | Yes — must match Node ABI  | No — pure WASM   |
| Works with Node.js SEA      | Problematic                | Yes              |
| Rebuild step needed         | Yes                        | No               |
| Windows cross-compile       | Hard                       | Trivial          |
| Performance                 | Slightly faster            | ~10-15% slower   |

Install: `bun add sql.js` — `sql.js` is a TypeORM peer dep; ensure it is explicitly listed.

### 1.4 DB_PATH env var

The `DB_PATH` env var lets Tauri pass the correct user-data directory path without touching the Docker deploy path (`/app/data/kanban.db`).

### 1.5 SSE Event Stream (`GET /events`)

Add a single SSE endpoint that broadcasts typed events to all connected clients whenever the kanban data changes.

**Event types:**

| Event name         | Payload                                    | Triggered when                                      |
| ------------------ | ------------------------------------------ | --------------------------------------------------- |
| `tasks:created`    | `{ task: TaskOut }`                        | `POST /tasks` or `POST /tasks/batch`                |
| `tasks:updated`    | `{ task: TaskOut }`                        | `PATCH /tasks/:id`, `POST /tasks/:id/transition`    |
| `tasks:deleted`    | `{ id: string }`                           | `DELETE /tasks/:id`                                 |
| `tasks:expired`    | `{ ids: string[] }`                        | Expiry cron sweep                                   |
| `projects:updated` | `{ projects: ProjectOut[] }`               | Any task mutation (downstream project counts change)|

Implementation in `app.ts` uses a simple in-process event emitter (`EventEmitter`) shared across routers via the DI container:

```ts
import { EventEmitter } from 'events';
import { createToken, provide, inject } from '@ee/di';

export const EVENT_BUS = createToken<EventEmitter>('EVENT_BUS');
provide(EVENT_BUS, new EventEmitter({ captureRejections: true }));

// In app.ts, register the SSE route:
fastify.get('/events', (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.flushHeaders();

  const bus = inject(EVENT_BUS);

  const send = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const handlers: Record<string, (data: unknown) => void> = {
    'tasks:created':    (d) => send('tasks:created', d),
    'tasks:updated':    (d) => send('tasks:updated', d),
    'tasks:deleted':    (d) => send('tasks:deleted', d),
    'tasks:expired':    (d) => send('tasks:expired', d),
    'projects:updated': (d) => send('projects:updated', d),
  };

  for (const [event, handler] of Object.entries(handlers)) {
    bus.on(event, handler);
  }

  // Heartbeat to keep the connection alive through proxies
  const heartbeat = setInterval(() => reply.raw.write(':heartbeat\n\n'), 30_000);

  request.socket.on('close', () => {
    clearInterval(heartbeat);
    for (const [event, handler] of Object.entries(handlers)) {
      bus.off(event, handler);
    }
  });

  reply.hijack();
});
```

Tasks and projects routers `inject(EVENT_BUS)` and emit on every mutation. The expiry cron does the same.

### 1.6 CORS

The existing `@ee/starter` `MainPlugin` already registers CORS. Tauri's WebviewWindow hits the same local `http://127.0.0.1:{port}` origin, so no CORS config change needed. `EventSource` is same-origin in all deployment scenarios.

---

## Part 2 — Angular Frontend (`apps/kanban-ui/`)

### 2.1 Project Structure

```
apps/kanban-ui/
├── project.json
├── tsconfig.json
├── tsconfig.app.json
└── src/
    ├── main.ts
    ├── app.config.ts
    ├── app.routes.ts
    ├── index.html
    ├── styles.scss
    ├── environments/
    │   ├── environment.ts
    │   └── environment.prod.ts
    └── app/
        ├── layout/
        │   └── layout.component.ts       # Shell: sidebar nav + router-outlet
        ├── dashboard/
        │   └── dashboard.component.ts    # Project overview cards + agent monitor
        ├── board/
        │   ├── board.component.ts        # Kanban columns for a single project
        │   └── task-card.component.ts    # Task card inside a column
        ├── task-detail/
        │   └── task-detail.component.ts  # Tabbed task detail panel
        ├── agents/
        │   └── agents.component.ts       # Live agent monitor table
        └── services/
            ├── kanban-api.service.ts     # All HTTP calls + SSE stream helpers
            └── types.ts                  # Shared TypeScript interfaces
```

### 2.2 Routing

| Route             | Component               | Description                                      |
| ----------------- | ----------------------- | ------------------------------------------------ |
| `/`               | redirect to `/dashboard`|                                                  |
| `/dashboard`      | `DashboardComponent`    | Project summary cards + active agents widget     |
| `/board/:project` | `BoardComponent`        | Kanban board for one project                     |
| `/tasks/:id`      | `TaskDetailComponent`   | Full-page task detail (deep link)                |
| `/agents`         | `AgentsComponent`       | All active IN_PROGRESS tasks across all projects |

All routes are lazy-loaded (`loadComponent: () => import(...)`).

### 2.3 Layout Component

PrimeNG `p-menubar` or a custom sidebar with `p-panelMenu`:

- **Sidebar nav**: Dashboard, Agents Monitor
- **Dynamic project links**: fetched on load from `GET /projects`, rendered as nav items pointing to `/board/:project`
- **Theme toggle**: Aura Dark/Light switcher
- **Connection indicator**: colored dot (green = SSE connected, yellow = reconnecting, red = offline)

### 2.4 Dashboard Component

**Data source**: initial `GET /projects` snapshot, then live-updated by `projects:updated` and `tasks:*` SSE events.

Layout:
- **Project summary grid**: One `p-card` per project.
  - Project name header
  - State counts as colored `p-tag` pills (BACKLOG / TODO / IN_PROGRESS / BLOCKED / IN_REVIEW / DONE)
  - Click navigates to `/board/:project`
- **Active agents widget**: Inline table below the cards
  - Columns: Agent, Task, Project, State, Time IN_PROGRESS, TTL bar
  - `p-progressBar` for TTL countdown (expires at 30 min mark)
  - Row click navigates to `/tasks/:id`

### 2.5 Board Component

**Data source**: initial `GET /tasks?project=:project` snapshot, then live-patched by `tasks:*` SSE events filtered to the current project.

Layout: horizontal scroll of 6 `p-card` columns, one per state:

```
BACKLOG  |  TODO  |  IN_PROGRESS  |  BLOCKED  |  IN_REVIEW  |  DONE
```

Each column:
- State name header + task count badge
- Scrollable list of `TaskCardComponent`s
- `IN_PROGRESS` column has TTL countdown on each card

**Filter bar** (above columns):
- `p-inputText` for text search
- `p-multiSelect` for assignee filter
- `p-slider` for priority range
- `p-button` to clear filters

**Interactions**:
- Click card opens `TaskDetailComponent` in a `p-sidebar` (right panel)
- "New Task" `p-button` opens an inline dialog (`p-dialog`) with creation form

### 2.6 Task Card Component

Compact card inside a column:

```
+----------------------------------+
| [P:1] Implement auth             |
| chat-frontend                    |
| @agent-copilot-3    12m ago      |
| [dep: 2] [subtasks: 3/5]         |
+----------------------------------+
```

- Priority badge (1-10 = red, 11-50 = orange, 51+ = gray)
- `p-tag` for state
- Assignee chip
- Time since `assignedAt` (for IN_PROGRESS)
- Dependency and subtask counts as small chips

### 2.7 Task Detail Component

Displayed in a `p-sidebar` (right-side panel, 480px) when invoked from the board, or as a full page at `/tasks/:id`.

**Header section**:
- Editable title (`p-inplace`)
- State badge (`p-tag`) with valid transition buttons (`p-splitButton` or `p-buttonGroup`)
- Priority inline editor
- Project / assignee / parent task metadata

**Tab view** (`p-tabs`):

| Tab              | Content                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Details**      | Editable description (markdown textarea), metadata fields, PATCH on blur                                                                      |
| **Activity**     | `p-timeline` of all activity entries (system + comments). Comment input at the bottom.                                                        |
| **History**      | `p-timeline` of state transitions. Duration chips per state (e.g. "TODO: 5m / IN_PROGRESS: 1h 22m"). Bar chart (`p-chart`) of time-in-state. |
| **Dependencies** | List of `dependsOn` tasks with state badges. Add dependency (UUID input or task search). Remove button per dep.                               |
| **Subtasks**     | Checklist of subtasks. Progress bar (X/N done). Add subtask button. Click subtask opens nested detail.                                        |

### 2.8 Agents Monitor Component

**Data source**: initial `GET /tasks?state=IN_PROGRESS` snapshot, then live-updated by `tasks:*` SSE events (filter to keep only IN_PROGRESS rows).

`p-table` with columns:
- Agent name
- Task title (link to detail)
- Project
- Priority
- Assigned at (relative time + absolute tooltip)
- TTL countdown (`p-progressBar` going from green to orange to red as it approaches 30 min)
- Action: "View Task" button

Empty state: "No agents are currently active."

### 2.9 Kanban API Service

```ts
@Injectable({ providedIn: 'root' })
export class KanbanApiService {
  private http = inject(HttpClient);
  private base = '';  // same-origin

  getProjects() { return this.http.get<Project[]>(`${this.base}/projects`); }

  listTasks(filters?: TaskFilters) { ... }
  getTask(id: string) { ... }
  createTask(data: TaskIn) { ... }
  batchCreate(data: BatchCreate) { ... }
  patchTask(id: string, data: TaskPatch) { ... }
  deleteTask(id: string) { ... }
  transition(id: string, state: TaskState) { ... }
  nextTask(assignee: string, project: string) { ... }

  listDependencies(taskId: string) { ... }
  addDependency(taskId: string, dependsOnId: string) { ... }
  removeDependency(taskId: string, dependsOnId: string) { ... }

  listSubtasks(taskId: string) { ... }

  getHistory(taskId: string) { ... }
  getActivity(taskId: string) { ... }
  postComment(taskId: string, data: CommentIn) { ... }

  // SSE event stream — single shared connection, multicast to all subscribers
  private eventSource: EventSource | null = null;

  events(): Observable<KanbanEvent> {
    return new Observable<KanbanEvent>(observer => {
      if (!this.eventSource) {
        this.eventSource = new EventSource(`${this.base}/events`);
      }
      const es = this.eventSource;

      const onEvent = (type: KanbanEvent['type']) => (e: MessageEvent) => {
        observer.next({ type, payload: JSON.parse(e.data) });
      };

      const types: KanbanEvent['type'][] = [
        'tasks:created', 'tasks:updated', 'tasks:deleted',
        'tasks:expired', 'projects:updated',
      ];

      for (const type of types) {
        es.addEventListener(type, onEvent(type));
      }
      es.onerror = () => observer.error(new Error('SSE connection lost'));

      return () => {
        for (const type of types) {
          es.removeEventListener(type, onEvent(type));
        }
      };
    });
  }

  // Convenience: snapshot + live delta stream for a set of filters
  // Components call this, then apply the incoming events to local signal state
  tasksSnapshot(filters: TaskFilters) {
    return this.listTasks(filters);
  }
}
```

### 2.10 `project.json` (Nx)

Dev proxy (`proxy.conf.json`) forwards `/tasks` and `/projects` to `http://localhost:3333` so `bun nx serve kanban-ui` works standalone during development.

```json
{
  "/tasks": { "target": "http://localhost:3333", "secure": false },
  "/projects": { "target": "http://localhost:3333", "secure": false },
  "/events": { "target": "http://localhost:3333", "secure": false, "ws": false }
}
```

Build with `--base-href /ui/` so all asset URLs are relative to the backend mount point.

---

## Part 3 — Tauri Desktop App (`apps/kanban-tauri/`)

### Why Tauri over Electron

|                          | Electron          | Tauri v2                           |
| ------------------------ | ----------------- | ---------------------------------- |
| Bundled Chromium         | Yes (~150 MB)     | No — uses OS webview               |
| Installer size           | ~150-200 MB       | ~5-15 MB                           |
| Runtime requirements     | None              | WebView2 (auto-installed on Win11) |
| Main process language    | Node.js           | Rust                               |
| Native module rebuild    | Required (SQLite) | Not needed (sql.js is pure WASM)   |
| Security model           | contextIsolation  | Capability-based permissions       |

### 3.1 Project Structure

```
apps/kanban-tauri/
├── project.json              # Nx build/package targets
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json      # Tauri v2 capability: sidecar + shell
    ├── binaries/
    │   └── kanban-server-{target-triple}   # placed by build pipeline
    ├── icons/
    │   ├── icon.icns
    │   ├── icon.ico
    │   ├── 32x32.png
    │   └── 128x128.png
    └── src/
        └── main.rs           # Tauri main process
```

### 3.2 Main Process (`main.rs`)

The Rust main process:
1. Spawns the Fastify server as a **sidecar** (via `tauri-plugin-shell`)
2. Reads `PORT:{n}` from the sidecar's stdout
3. Creates a `WebviewWindow` pointing at `http://127.0.0.1:{n}/ui/`

```rust
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = app.path().app_data_dir().unwrap();
            let db_path = data_dir.join("kanban.db");

            let sidecar_cmd = app_handle
                .shell()
                .sidecar("kanban-server")
                .unwrap()
                .env("DB_PATH", db_path.to_str().unwrap())
                .env("NODE_ENV", "production");

            let (mut rx, _child) = sidecar_cmd.spawn().unwrap();

            tauri::async_runtime::spawn(async move {
                let mut port: Option<u16> = None;
                while let Some(event) = rx.recv().await {
                    if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                        let text = String::from_utf8_lossy(&line);
                        if let Some(p) = text.strip_prefix("PORT:") {
                            port = p.trim().parse().ok();
                            break;
                        }
                    }
                }
                let port = port.unwrap_or(3333);
                let url = format!("http://127.0.0.1:{}/ui/", port);
                WebviewWindowBuilder::new(
                    &app_handle,
                    "main",
                    WebviewUrl::External(url.parse().unwrap()),
                )
                .title("Kanban Agent Monitor")
                .inner_size(1400.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .build()
                .unwrap();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3.3 `tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Kanban Agent Monitor",
  "identifier": "ca.ethanelliott.kanban",
  "version": "1.0.0",
  "build": {
    "frontendDist": "../../../dist/apps/kanban-ui/browser"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "externalBin": ["binaries/kanban-server"]
  },
  "app": { "windows": [] }
}
```

The `externalBin` entry tells Tauri to bundle `binaries/kanban-server-{target-triple}` alongside the app. Tauri auto-appends the target triple at build time.

### 3.4 Capabilities (`capabilities/default.json`)

```json
{
  "identifier": "default",
  "description": "Kanban monitor desktop capabilities",
  "windows": ["main"],
  "permissions": ["core:default", "shell:allow-execute", "shell:allow-spawn"]
}
```

### 3.5 Packaging the Fastify Server as a Node.js SEA Binary

Use **Node.js Single Executable Application (SEA)** — available natively since Node.js 21:

```bash
# 1. Build the kanban backend (esbuild -> single main.js)
bun nx build kanban

# 2. Create SEA config
echo '{"main":"main.js","output":"sea-prep.blob","disableExperimentalSEAWarning":true}' \
  > dist/apps/kanban/sea-config.json

# 3. Generate the blob
node --experimental-sea-config dist/apps/kanban/sea-config.json

# 4. Copy the node binary and inject the blob
cp $(which node) dist/apps/kanban/kanban-server
npx postject dist/apps/kanban/kanban-server \
  NODE_SEA_BLOB dist/apps/kanban/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# 5. Place the binary as the Tauri sidecar (with Rust target triple suffix)
cp dist/apps/kanban/kanban-server \
   apps/kanban-tauri/src-tauri/binaries/kanban-server-$(rustc -vV | grep host | cut -d' ' -f2)
```

Because sql.js is pure WASM, esbuild bundles it cleanly via `--loader:.wasm=binary` — no external `.node` file, no platform-specific rebuild step.

### 3.6 DB Path per Platform

| Platform | Path                                                             |
| -------- | ---------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/ca.ethanelliott.kanban/kanban.db` |
| Windows  | `%APPDATA%\ca.ethanelliott.kanban\kanban.db`                     |
| Linux    | `~/.local/share/ca.ethanelliott.kanban/kanban.db`                |
| Docker   | `/app/data/kanban.db` (DB_PATH not set, unchanged)               |

### 3.7 Build Pipeline

```
# 1. Build Angular UI
bun nx build kanban-ui  (--base-href /ui/)
    -> dist/apps/kanban-ui/browser/

# 2. Build Fastify backend
bun nx build kanban     (esbuild single bundle)
    -> dist/apps/kanban/main.js

# 3. Copy UI into backend dist (for @fastify/static)
cp -r dist/apps/kanban-ui/browser dist/apps/kanban/ui

# 4. Package backend as Node.js SEA binary
bun nx sea kanban
    -> apps/kanban-tauri/src-tauri/binaries/kanban-server-{triple}

# 5. Build Tauri app
bun nx package kanban-tauri   ->  runs "tauri build"
    -> src-tauri/target/release/bundle/
        macos/   "Kanban Agent Monitor.dmg"
        windows/ "Kanban Agent Monitor_1.0.0_x64-setup.exe"
        linux/   "kanban-agent-monitor_1.0.0_amd64.AppImage"
```

The `kanban-tauri` `project.json` has:
- `build` target: runs `tauri build`
- `dev` target: runs `tauri dev` (opens Tauri window pointing at `bun nx serve kanban`)
- Both targets `dependsOn: [{ projects: ['kanban', 'kanban-ui'], target: 'build' }]`

---

## Part 4 — Full File Tree

```
apps/kanban-ui/
├── project.json
├── tsconfig.json
├── tsconfig.app.json
├── proxy.conf.json
└── src/
    ├── index.html
    ├── main.ts
    ├── styles.scss
    ├── app.config.ts
    ├── app.routes.ts
    ├── environments/
    │   ├── environment.ts
    │   └── environment.prod.ts
    └── app/
        ├── layout/
        │   └── layout.component.ts
        ├── dashboard/
        │   └── dashboard.component.ts
        ├── board/
        │   ├── board.component.ts
        │   └── task-card.component.ts
        ├── task-detail/
        │   └── task-detail.component.ts
        ├── agents/
        │   └── agents.component.ts
        └── services/
            ├── kanban-api.service.ts
            └── types.ts

apps/kanban-tauri/
├── project.json
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── icons/
    │   ├── icon.icns
    │   ├── icon.ico
    │   ├── 32x32.png
    │   └── 128x128.png
    ├── binaries/
    │   └── kanban-server-{target-triple}    <- placed by build pipeline
    ├── capabilities/
    │   └── default.json
    └── src/
        └── main.rs

apps/kanban/                    <- backend changes only
└── src/app/
    ├── app.ts                  <- add @fastify/static + redirect
    ├── data-source.ts          <- switch to sql.js + DB_PATH env var
    └── main.ts                 <- print PORT:{n} after listen
```

---

## Part 5 — UI Component Summary

| Component             | PrimeNG Components Used                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `LayoutComponent`     | `p-menubar`, `p-sidebar`, `p-avatar`, `p-badge`                                                                       |
| `DashboardComponent`  | `p-card`, `p-tag`, `p-progressBar`, `p-dataView`, `p-skeleton`                                                        |
| `BoardComponent`      | `p-scrollPanel`, `p-card`, `p-inputText`, `p-multiSelect`, `p-slider`, `p-button`, `p-dialog`, `p-sidebar`            |
| `TaskCardComponent`   | `p-tag`, `p-badge`, `p-chip`, `p-tooltip`, `p-ripple`                                                                 |
| `TaskDetailComponent` | `p-tabs`, `p-inplace`, `p-tag`, `p-buttonGroup`, `p-timeline`, `p-chart`, `p-textarea`, `p-progressBar`, `p-divider`  |
| `AgentsComponent`     | `p-table`, `p-tag`, `p-progressBar`, `p-button`, `p-tooltip`                                                          |

---

## Part 6 — Implementation Steps

1. **Backend: sql.js driver** — `bun add sql.js`, update `data-source.ts` to `type: 'sqljs'` + `autoSave: true` + `DB_PATH` env var, rebuild and smoke-test
2. **Backend: static serving** — `bun add @fastify/static`, update `app.ts` with static middleware + redirect, update `main.ts` to print `PORT:{n}` sentinel
3. **Scaffold `kanban-ui`** — `project.json`, `tsconfig`, `app.config.ts` (zoneless), `styles.scss` (PrimeNG Aura Dark), `proxy.conf.json`
4. **Types and API service** — `types.ts` matching the Zod schemas from kanban backend, `KanbanApiService` with all HTTP methods + `events()` SSE stream helper
5. **Layout component** — sidebar shell, project nav links populated from `/projects`, router-outlet, SSE connection indicator
6. **Dashboard component** — project cards, active agents mini-table; hydrated from HTTP snapshot then kept live by SSE
7. **Board component** — 6-column layout, task card subcomponent, filter bar, new-task dialog
8. **Task detail component** — tabbed panel: Details, Activity, History, Dependencies, Subtasks
9. **Agents component** — full-page agent monitor table with TTL bars
10. **Wire routes** — `app.routes.ts` with lazy loads, `app.config.ts` `provideRouter`
11. **Build integration** — update `kanban` build pipeline to copy `dist/apps/kanban-ui/browser` to `dist/apps/kanban/ui`
12. **Scaffold `kanban-tauri`** — `Cargo.toml`, `tauri.conf.json`, `main.rs`, `capabilities/default.json`, `project.json` Nx targets
13. **SEA build target** — `sea` Nx target in `kanban` project.json using `postject`
14. **Local smoke test** — dev proxy flow, then `bun nx package kanban-tauri` for installer
15. **Prettier + commit**

---

## Environment Variables (Updated)

| Variable           | Default                | Description                                          |
| ------------------ | ---------------------- | ---------------------------------------------------- |
| `PORT`             | `3333`                 | Fastify listen port                                  |
| `HOST`             | `0.0.0.0`              | Fastify listen host                                  |
| `TASK_TTL_MINUTES` | `30`                   | Stale task expiry TTL                                |
| `DB_PATH`          | _(see data-source.ts)_ | Override SQLite DB file path (used by Tauri sidecar) |

---

## Notes & Constraints

- **No authentication** — this is an internal tool; the kanban API has no auth and neither will the UI.
- **No separate web deploy** — the UI is colocated with the backend, served at `/ui/`. No nginx, no separate frontend Docker image needed.
- **Single-executable packaging** — the Tauri installer is a single `.dmg` / `.exe` that contains everything: the Rust shell, the Node.js SEA sidecar (Fastify + sql.js WASM + Angular UI), and an OS-provided webview. No bundled Chromium, no native `.node` rebuild step.
- **Rust toolchain required at build time** — `rustup` and the target platform toolchain must be installed on the build machine. Users do not need Rust; the final installer is self-contained.
- **Windows WebView2** — Tauri uses Microsoft Edge WebView2. Ships with Windows 11; auto-bootstrapped on Windows 10 by the Tauri installer (NSIS/MSI includes a WebView2 bootstrapper).
- **Angular dev server proxy** — during development, run both `bun nx serve kanban` (port 3333) and `bun nx serve kanban-ui` (port 4200 with proxy). The proxy forwards `/tasks`, `/projects`, and `/events` to the backend.
- **SSE reconnection** — the browser's `EventSource` API automatically reconnects on disconnect (with exponential back-off). On reconnect, components re-fetch the HTTP snapshot to fill the gap, then resume streaming deltas.
- **SSE and Tauri WebviewWindow** — the OS webview's `EventSource` implementation is fully spec-compliant on all target platforms (Safari/WebKit on macOS, WebView2 (Chromium-based) on Windows, WebKitGTK on Linux). No special handling needed.
- **sql.js WASM in SEA** — esbuild bundles the sql.js WASM blob inline via `--loader:.wasm=binary`. Keeps the SEA binary fully self-contained with no external `.wasm` file reference.
