# AI Chat Frontend — Build Plan

> Personal ChatGPT-like interface for the AI Gateway at `chat.elliott.haus`

## Overview

A standalone Angular 21 + PrimeNG 21 frontend that provides a rich conversational UI against the existing AI Gateway backend. Supports streaming responses (NDJSON), multi-turn conversations, tool-call visibility, approval workflows, model switching, image/file uploads for vision models, and saved prompt templates.

---

## Monorepo Context

This project lives inside a **Nx monorepo** (`ethanelliott.ca`) that contains all apps, shared libs, and deployment manifests for a self-hosted Kubernetes cluster at `elliott.haus`. Understanding the following is essential before writing any code.

### Repository Layout

```
apps/                     ← All frontend + backend applications
  chat-frontend/          ← THIS APP (new)
  recipes-frontend/       ← Primary reference for Angular + PrimeNG patterns
  finances-frontend/      ← Has an existing chat UI (uses Angular Material, NOT PrimeNG)
  camera-frontend/        ← Reference for real-time WebSocket patterns
  landing/                ← Portal page with bento grid of service links
  ai-gateway/             ← Backend this app talks to (Fastify + Ollama)
  ...
libs/backend/shared/      ← Shared backend packages (@ee/starter, @ee/di, @ee/environment)
deployments/              ← Helm charts + ArgoCD manifests for every service
tools/executors/          ← Custom Nx executors (build + deploy Docker images)
```

### Build System (Nx)

- **Package manager:** `bun` (not npm/yarn)
- **Monorepo tool:** Nx 22.3.3
- **Build executor:** `@angular-devkit/build-angular:application`
- **Dev server:** `@angular-devkit/build-angular:dev-server`
- **Container target:** Custom executor at `./tools/executors/deploy:container` — builds Docker image and updates the Helm chart's `values.yaml` image tag
- **Run dev server:** `bunx nx serve chat-frontend`
- **Run production build:** `bunx nx build chat-frontend`
- **Build + deploy container:** `bunx nx container chat-frontend`

### Key Dependency Versions (from root `package.json`)

| Package          | Version  |
| ---------------- | -------- |
| Angular          | 21.0.6   |
| PrimeNG          | ^21.1.1  |
| @primeuix/themes | ^2.0.3   |
| PrimeIcons       | ^7.0.0   |
| RxJS             | ~7.8.2   |
| marked           | ^17.0.2  |
| Node             | >=24.8.0 |
| Nx               | 22.3.3   |

All dependencies are in the **root** `package.json` — individual apps do NOT have their own `package.json`.

### Angular Conventions Used Across All Frontends

These are **strict patterns** — every component in the codebase follows them:

1. **Standalone components only** — every component has `standalone: true` (no NgModules)
2. **Zoneless change detection** — `provideZonelessChangeDetection()` in `app.config.ts`, no Zone.js
3. **`ChangeDetectionStrategy.OnPush`** — on every single component
4. **Single-file components** — template + styles are inline via template literals (`template: \`...\``, `styles: \`...\``)
5. **Angular Signals** — use `signal()`, `computed()`, `viewChild()` for all component state. No `BehaviorSubject` for UI state.
6. **New control flow syntax** — `@for`, `@if`, `@switch` (NOT `*ngFor`, `*ngIf`)
7. **`inject()` function** — NOT constructor injection. Example: `private readonly http = inject(HttpClient);`
8. **Lazy-loaded routes** — `loadComponent: () => import('./path').then(m => m.Component)`
9. **Types co-located in service files** — interfaces live alongside the service that uses them, NOT in separate model files (exception: shared types can go in `models/types.ts`)
10. **No RxJS for component state** — Observables are only used for HTTP calls and streams; component-level state is signals

---

## Reference Files

These are the exact files to copy/adapt when scaffolding. All examples come from `recipes-frontend` (the primary PrimeNG reference app).

### `project.json`

```json
{
  "name": "chat-frontend",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "prefix": "app",
  "sourceRoot": "apps/chat-frontend/src",
  "tags": [],
  "targets": {
    "build": {
      "executor": "@angular-devkit/build-angular:application",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/chat-frontend",
        "index": "apps/chat-frontend/src/index.html",
        "browser": "apps/chat-frontend/src/main.ts",
        "polyfills": [],
        "tsConfig": "apps/chat-frontend/tsconfig.app.json",
        "inlineStyleLanguage": "scss",
        "assets": [{ "glob": "**/*", "input": "apps/chat-frontend/public" }],
        "styles": ["apps/chat-frontend/src/styles.scss"],
        "scripts": []
      },
      "configurations": {
        "production": {
          "budgets": [
            { "type": "initial", "maximumWarning": "800kb", "maximumError": "1.5mb" },
            { "type": "anyComponentStyle", "maximumWarning": "500kb", "maximumError": "1mb" }
          ],
          "optimization": {
            "scripts": true,
            "styles": { "minify": true, "inlineCritical": false },
            "fonts": true
          },
          "outputHashing": "all",
          "fileReplacements": [
            {
              "replace": "apps/chat-frontend/src/environments/environment.ts",
              "with": "apps/chat-frontend/src/environments/environment.prod.ts"
            }
          ]
        },
        "development": {
          "optimization": false,
          "extractLicenses": false,
          "sourceMap": true
        }
      },
      "defaultConfiguration": "production"
    },
    "serve": {
      "executor": "@angular-devkit/build-angular:dev-server",
      "configurations": {
        "production": { "buildTarget": "chat-frontend:build:production" },
        "development": { "buildTarget": "chat-frontend:build:development" }
      },
      "defaultConfiguration": "development"
    },
    "container": {
      "dependsOn": ["build"],
      "executor": "./tools/executors/deploy:container",
      "options": {
        "image": "ethanelliottio/chat-frontend",
        "dockerfile": "apps/chat-frontend/Dockerfile",
        "deployment": "chat-frontend"
      }
    }
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2022",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.app.json" }
  ],
  "extends": "../../tsconfig.base.json",
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

### `tsconfig.app.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "types": [],
    "moduleResolution": "bundler"
  },
  "files": ["src/main.ts"],
  "include": ["src/**/*.d.ts"],
  "exclude": ["jest.config.ts", "src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

### `src/main.ts`

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
```

### `src/index.html`

```html
<!DOCTYPE html>
<html lang="en" class="dark-mode">
  <head>
    <meta charset="utf-8" />
    <title>AI Chat</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
```

Note: The `class="dark-mode"` on `<html>` activates PrimeNG's dark theme via the `darkModeSelector` config.

### `src/app/app.config.ts` (adapted for blue theme)

```typescript
import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { appRoutes } from './app.routes';

const ChatTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: ChatTheme,
        options: {
          darkModeSelector: '.dark-mode',
        },
      },
    }),
  ],
};
```

### `src/app/app.component.ts`

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  template: `<router-outlet />`,
  styles: ``,
})
export class AppComponent {}
```

### `src/environments/environment.ts` (dev)

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3100',  // AI Gateway dev port
};
```

### `src/environments/environment.prod.ts`

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://ai-gateway.elliott.haus',
};
```

### `src/styles.scss` (adapted for blue)

```scss
@use 'primeicons/primeicons.css';

p-inputnumber,
p-inputtext,
p-multiselect,
p-select,
p-autocomplete,
p-textarea {
  display: block;
  width: 100%;
}

input[pInputText],
textarea[pTextarea] {
  width: 100%;
}

html,
body {
  height: 100%;
  margin: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color-scheme: dark;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--p-surface-500);
  border-radius: 4px;
  &:hover {
    background: var(--p-surface-400);
  }
}

::selection {
  background: rgba(59, 130, 246, 0.3); /* blue selection */
  color: white;
}

@media (max-width: 768px) {
  body {
    -webkit-overflow-scrolling: touch;
  }
  html {
    -webkit-text-size-adjust: 100%;
  }
  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
}

@supports (padding-top: env(safe-area-inset-top)) {
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

### PrimeNG CSS Variables (used in component styles)

These are the design tokens available in all inline component styles:

```
--p-surface-0 through --p-surface-950   (background shades)
--p-primary-color                        (blue.500 in our theme)
--p-primary-contrast-color               (text on primary bg)
--p-text-color                           (main text)
--p-text-muted-color                     (secondary text)
--p-surface-border                       (borders)
--p-content-background                   (card/panel backgrounds)
```

### Layout Pattern (from `recipes-frontend`)

The `LayoutComponent` is the shell — sidebar + content area + mobile drawer:

```typescript
@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterModule, DrawerModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mobile Header -->
    <div class="mobile-header">
      <p-button icon="pi pi-bars" [text]="true" severity="secondary"
        (click)="drawerVisible.set(true)" />
      <span class="mobile-title">...</span>
    </div>

    <!-- Mobile Drawer (PrimeNG) -->
    <p-drawer [(visible)]="drawerVisible" [modal]="true" [showCloseIcon]="false"
      styleClass="sidebar-drawer">
      <ng-template #header>...</ng-template>
      <nav><!-- nav links with routerLink --></nav>
    </p-drawer>

    <!-- Desktop Sidebar -->
    <aside class="desktop-sidebar"><!-- same nav links --></aside>

    <!-- Main Content -->
    <main class="main-content">
      <router-outlet />
    </main>
  `,
  styles: `
    :host { display: flex; height: 100vh; overflow: hidden; background: var(--p-surface-950); }
    .desktop-sidebar { width: 220px; background: var(--p-surface-900); border-right: 1px solid var(--p-surface-700); }
    .main-content { flex: 1; overflow-y: auto; padding: 24px; }
    @media (max-width: 768px) {
      .desktop-sidebar { display: none; }
      .mobile-header { display: flex; }
      .main-content { padding: 72px 16px 16px; }
    }
  `,
})
export class LayoutComponent {
  drawerVisible = signal(false);
}
```

### Streaming Pattern (from `recipes-frontend`)

This is the exact `fetch()` + `ReadableStream` pattern used for SSE/NDJSON streaming in services:

```typescript
chatAboutRecipeStream(recipeId: string, question: string, history: Message[] = []): Observable<{ token: string; done: boolean }> {
  return new Observable((subscriber) => {
    const abortController = new AbortController();

    fetch(`${this.baseUrl}/ai/chat/${recipeId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
        if (!response.body) throw new Error('Response body is null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;

        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (done) break;

          buffer += decoder.decode(result.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              subscriber.next(JSON.parse(trimmed));  // NDJSON: each line is JSON
            } catch { /* skip malformed */ }
          }
        }
        subscriber.complete();
      })
      .catch((error) => {
        if (error.name !== 'AbortError') subscriber.error(error);
      });

    return () => abortController.abort();
  });
}
```

**Key difference for AI Gateway:** The recipes backend uses SSE (`data: {...}\n`), but the AI Gateway uses **raw NDJSON** — each line is a standalone JSON object (no `data: ` prefix). Adjust parsing accordingly.

---

## AI Gateway API Reference

The backend already exists at `apps/ai-gateway/`. In production: `https://ai-gateway.elliott.haus`. These are the endpoints the chat frontend calls.

### `POST /chat/stream` (primary endpoint)

Stateless NDJSON streaming. Send full message history each request; get back updated history in the `done` event.

**Request body:**

```typescript
{
  messages: Array<
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
    | { role: 'tool'; content: string; tool_call_id?: string; name?: string }
  >;  // min 1 message
  config?: {
    enabledTools?: string[];    // whitelist
    disabledTools?: string[];   // blacklist
    model?: string;             // e.g. 'llama3.1:8b'
    temperature?: number;       // 0–2
  };
}
```

**Response:** NDJSON stream (`Content-Type: application/x-ndjson`). Each line:

```json
{"type": "<event>", "timestamp": 1234567890, "data": { ... }}
```

**Stream event types** (all defined in `apps/ai-gateway/src/app/types.ts`):

| Type                | `data` fields                                                                                  | Description                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `status`            | `message`                                                                                      | Status text ("Thinking…", "Selecting tools…")       |
| `thinking`          | `token`, `done`                                                                                | Orchestrator reasoning tokens                       |
| `token`             | `token`, `role` (`assistant`\|`orchestrator`\|`agent`), `agentName?`, `done`                   | LLM output tokens — append to build response        |
| `tool_call_start`   | `tool`, `input`, `agentName?`                                                                  | Tool execution beginning                            |
| `tool_call_end`     | `tool`, `output` (MCPToolResult), `durationMs`, `agentName?`                                   | Tool execution complete                             |
| `delegation_start`  | `agentName`, `task`                                                                            | Sub-agent delegation beginning                      |
| `delegation_end`    | `agentName`, `content`, `durationMs`                                                           | Sub-agent delegation complete                       |
| `agent_thinking`    | `agentName`, `token`, `done`, `iteration`, `maxIterations`                                     | Sub-agent reasoning tokens                          |
| `agent_response`    | `agentName`, `content`                                                                         | Sub-agent final response                            |
| `approval_required` | `approvalId`, `tool`, `input`, `message?`, `userParametersSchema?`, `agentName?`               | Human-in-the-loop: tool needs approval              |
| `approval_received` | `approvalId`, `approved`, `userParameters?`, `rejectionReason?`                                | Approval response acknowledged                      |
| `content`           | `content`, `partial?`                                                                          | Response content chunk                              |
| `done`              | `response`, `messages` (updated history), `delegations[]`, `totalDurationMs`, `enabledTools[]` | Stream complete — **save `messages` for next turn** |
| `error`             | `error`                                                                                        | Error occurred                                      |

### `POST /chat/approve`

Submit approval or rejection for a pending tool call.

```typescript
// Request
{ approvalId: string; approved: boolean; userParameters?: Record<string, unknown>; rejectionReason?: string }
// Response: 200 OK
```

### `GET /agents/models`

Returns available Ollama models for the model selector dropdown.

### `GET /tools`

Returns all registered tools (name, description, category, parameters, approval config).

### `GET /tools/categories`

Returns tool category names for grouping in settings.

### `GET /agents`

Returns registered agents (name, description, model).

---

## Deployment Reference

All frontends follow the exact same deployment pattern. Copy from `deployments/recipes-frontend/` and find-replace `recipes-frontend` → `chat-frontend`, `recipes.elliott.haus` → `chat.elliott.haus`.

### `Dockerfile`

```dockerfile
FROM docker.io/nginx:alpine
COPY dist/apps/chat-frontend/browser /usr/share/nginx/html
COPY apps/chat-frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### `nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost chat.elliott.haus;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
```

### Helm Chart (`deployments/chat-frontend/`)

**`Chart.yaml`:**

```yaml
apiVersion: v2
name: chat-frontend
description: AI Chat frontend Angular application chart
type: application
version: 0.0.1
appVersion: '0.0.1'
dependencies: []
```

**`values.yaml`:**

```yaml
replicaCount: 1
image:
  repository: ethanelliottio/chat-frontend
  tag: latest
  pullPolicy: Always
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: true
  hostname: 'chat.elliott.haus'
resources:
  limits:
    cpu: 200m
    memory: 128Mi
  requests:
    cpu: 100m
    memory: 64Mi
configMap:
  enabled: true
  name: chat-frontend-nginx-config
  mountPath: /etc/nginx/conf.d/default.conf
  subPath: nginx.conf
```

**`application.yaml`** (ArgoCD):

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: chat-frontend
  namespace: elliott-haus
spec:
  project: elliott-haus
  source:
    repoURL: https://github.com/ethanelliott/ethanelliott.ca.git
    path: deployments/chat-frontend
    targetRevision: main
    helm:
      releaseName: chat-frontend
  destination:
    server: https://kubernetes.default.svc
    namespace: elliott-haus
  syncPolicy:
    automated: {}
```

**Helm templates** — copy verbatim from `deployments/recipes-frontend/templates/` and replace `recipes-frontend` with `chat-frontend` in:
- `_helpers.tpl` (template names)
- `deployment.yaml`, `service.yaml`, `ingress.yaml`, `configmap.yaml` (all use helpers)

The templates use Traefik `IngressRoute` (not standard Ingress) with `certResolver: myresolver` for TLS.

### Landing Page Update

Add a new entry to the `appLinks` array in `apps/landing/src/app/home/home.component.ts`:

```typescript
{
  name: 'AI Chat',
  url: 'https://chat.elliott.haus',
  description: 'AI assistant powered by local LLMs.',
  icon: 'mdi:chat-processing',
  color: '#3b82f6',  // blue-500
},
```

---

## Architecture

```
┌─────────────────────────┐       NDJSON streaming        ┌──────────────────────┐
│   chat.elliott.haus     │  ──── POST /chat/stream ────▶ │  ai-gateway service  │
│   (Angular + PrimeNG)   │  ◀─── token/event stream ──── │  (Fastify)           │
│                         │                                │                      │
│   - Conversation state  │  ──── GET /agents ──────────▶  │  ┌────────────────┐  │
│     held client-side    │  ──── GET /tools ───────────▶  │  │  Ollama (GPU)  │  │
│   - Message history     │  ──── POST /chat/approve ───▶  │  └────────────────┘  │
│     sent each request   │                                │                      │
└─────────────────────────┘                                └──────────────────────┘
```

**Key design decision:** Use the **stateless streaming endpoint** (`POST /chat/stream`). The full message history is managed client-side and sent with each request. The `done` event returns the updated `messages` array to use for the next turn.

---

## Pages & Routes

```
/                → redirect to /chat
/chat            → ChatPage (main conversation view)
/chat/:id        → ChatPage (load saved conversation by local ID)
/settings        → SettingsPage (model config, prompt templates, preferences)
```

All routes are children of a `LayoutComponent` shell (sidebar + main content area), matching the recipes-frontend pattern.

---

## Components

### Layout

#### `LayoutComponent`
- Left sidebar: conversation list, new chat button, settings link
- Collapsible on mobile via PrimeNG `Drawer`
- Top bar: current model indicator, dark mode toggle

### Chat Page

#### `ChatPageComponent`
- Manages the active conversation signal
- Wires up the streaming service and routes events to child components

#### `MessageListComponent`
- Scrollable container of `MessageBubbleComponent` instances
- Auto-scroll to bottom on new tokens (with "scroll to bottom" FAB if user has scrolled up)
- Empty state with welcome message and suggestion chips

#### `MessageBubbleComponent`
- Renders a single message (user or assistant)
- **User bubble:** right-aligned, primary color background, plain text or attached image thumbnail
- **Assistant bubble:** left-aligned, surface background, rendered markdown (via `marked`)
  - Code blocks with syntax highlighting and copy button
  - Inline tool-call chips (see `ToolCallChipComponent`)
  - Thinking/reasoning collapsible section

#### `ToolCallChipComponent`
- Inline pill showing tool name + status (pending spinner / success check / error X)
- Expandable to show tool input/output JSON
- For `approval_required` events: shows approve/reject buttons + optional parameter form

#### `ApprovalDialogComponent`
- PrimeNG `Dialog` modal for tool approval requests
- Shows tool name, description, input parameters
- Optional user parameter form (dynamic, from `userParametersSchema`)
- Approve / Reject buttons with optional rejection reason textarea

#### `ChatInputComponent`
- Fixed bottom bar with:
  - PrimeNG `Textarea` (auto-grow, shift+enter for newline, enter to send)
  - Attach file button (image upload for vision models)
  - Send button (disabled while streaming)
  - Stop generation button (visible during streaming, calls `AbortController.abort()`)
- Drag-and-drop support on the entire chat area
- Supported file types: images (JPEG, PNG, GIF, WebP) and text files (.txt, .md, .json, .csv, common code extensions)

#### `SuggestionChipsComponent`
- Row of clickable prompt suggestions shown in empty state
- Configurable list (hardcoded defaults + user-saved templates from settings)

#### `ModelSelectorComponent`
- PrimeNG `Select` dropdown populated from `GET /agents/models`
- Shows current model name in the top bar
- Passed into stream requests via `config.model`

### Settings Page

#### `SettingsPageComponent`
- **Model Preferences:** default model, temperature slider (`0–2`, PrimeNG `Slider`)
- **Prompt Templates:** CRUD list of saved system prompts / starter messages
  - Name, description, system prompt text
  - Stored in `localStorage`
- **Tool Configuration:** toggle tools on/off (fetched from `GET /tools`)
  - Grouped by category (from `GET /tools/categories`)
  - Stored as `enabledTools` / `disabledTools` arrays
- **System Prompt:** global default system prompt (prepended to all new conversations), editable here
- **Appearance:** dark mode toggle, font size
- **Data Management:** export/import conversations as JSON, clear all data

---

## Services

### `ChatApiService`
Core service for AI Gateway communication.

```
Methods:
├── streamChat(messages, config?) → Observable<StreamEvent>
│   Uses fetch() + ReadableStream, parses NDJSON lines
│   Emits typed StreamEvent objects (status, token, tool_call_start, done, etc.)
│   Supports cancellation via AbortController
│
├── approveToolCall(approvalId, approved, params?) → Observable<void>
│   POST /chat/approve
│
├── getModels() → Observable<Model[]>
│   GET /agents/models
│
├── getTools() → Observable<Tool[]>
│   GET /tools
│
├── getToolCategories() → Observable<Category[]>
│   GET /tools/categories
│
├── getAgents() → Observable<Agent[]>
│   GET /agents
│
└── getPendingApprovals() → Observable<Approval[]>
    GET /chat/approvals
```

**Streaming implementation:** Use the NDJSON streaming pattern documented in the Reference Files section above. The key adaptation for the AI Gateway is that lines are raw JSON (no `data: ` prefix like SSE). See `chatAboutRecipeStream` in `recipes-api.service.ts` for the base pattern.

### `ConversationService`
Client-side conversation state management.

```
State (signals):
├── conversations: Signal<Conversation[]>       — all saved conversations
├── activeConversationId: Signal<string | null>  — currently selected
├── activeConversation: computed<Conversation>   — derived from above
├── isStreaming: Signal<boolean>                  — streaming in progress
└── pendingApproval: Signal<Approval | null>     — if tool needs approval

Methods:
├── createConversation(title?) → Conversation
├── deleteConversation(id) → void
├── renameConversation(id, title) → void
├── addMessage(conversationId, message) → void
├── updateLastAssistantMessage(conversationId, token) → void  // append during stream
├── setMessagesFromDone(conversationId, messages) → void       // replace with server's version
├── clearAll() → void
└── exportAll() / importAll(json) → void
```

**Persistence:** All conversations stored in `localStorage` (serialized JSON). On init, hydrate from storage. On every mutation, persist back. ~5MB practical limit — add a conversation count/size warning in settings. No authentication required (cluster is network-protected).

### `SettingsService`
User preferences persisted to `localStorage`.

```
State (signals):
├── defaultModel: Signal<string>
├── temperature: Signal<number>
├── darkMode: Signal<boolean>
├── fontSize: Signal<'small' | 'medium' | 'large'>
├── enabledTools: Signal<string[]>
├── disabledTools: Signal<string[]>
├── globalSystemPrompt: Signal<string>         — prepended to all new conversations
└── promptTemplates: Signal<PromptTemplate[]>
```

### `MarkdownService`
Wrapper around `marked` for safe HTML rendering of assistant messages.

```
Methods:
├── render(markdown: string) → string (sanitized HTML)
└── renderStreaming(partial: string) → string (tolerant of incomplete markdown)
```

---

## Stream Event Handling

The `ChatPageComponent` subscribes to `ChatApiService.streamChat()` and processes events:

| Event               | Action                                                                |
| ------------------- | --------------------------------------------------------------------- |
| `status`            | Show status text below message list (e.g., "Thinking…")               |
| `thinking`          | Append to collapsible "thinking" section in current assistant bubble  |
| `token`             | Append token to current assistant message content, re-render markdown |
| `tool_call_start`   | Add a pending tool chip to current message                            |
| `tool_call_end`     | Update chip status to success/error, show expandable result           |
| `delegation_start`  | Show "Delegating to {agent}…" status chip                             |
| `delegation_end`    | Update delegation chip with result                                    |
| `agent_thinking`    | Append to sub-agent thinking section                                  |
| `agent_response`    | Show sub-agent response inline                                        |
| `approval_required` | Pause stream, open `ApprovalDialogComponent`, POST approval/rejection |
| `done`              | Finalize message, store updated `messages` array for next turn        |
| `error`             | Show error toast (PrimeNG `Toast`)                                    |

---

## Data Models (TypeScript interfaces)

```typescript
interface Conversation {
  id: string;                    // crypto.randomUUID()
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];       // the full history sent to the API
  displayMessages: DisplayMessage[];  // UI-specific (includes tool chips, thinking, etc.)
  config?: ChatConfig;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  name?: string;
  tool_call_id?: string;
  images?: string[];             // base64 for vision
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;               // raw markdown (assistant) or plain text (user)
  renderedHtml?: string;         // cached markdown render
  toolCalls?: DisplayToolCall[];
  thinking?: string;
  attachments?: FileAttachment[];
  timestamp: number;
}

interface DisplayToolCall {
  name: string;
  status: 'pending' | 'success' | 'error' | 'approval-required';
  input?: Record<string, unknown>;
  output?: string;
  approvalId?: string;
  durationMs?: number;
}

interface ChatConfig {
  model?: string;
  temperature?: number;
  enabledTools?: string[];
  disabledTools?: string[];
}

interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  starterMessage?: string;
}

interface StreamEvent {
  event: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface FileAttachment {
  name: string;
  type: string;
  base64: string;
  previewUrl?: string;       // object URL for image thumbnail
}
```

---

## File Structure

```
apps/chat-frontend/
├── Dockerfile
├── nginx.conf
├── project.json
├── tsconfig.json
├── tsconfig.app.json
├── public/
│   └── favicon.ico
├── src/
│   ├── index.html
│   ├── main.ts
│   ├── styles.scss
│   ├── environments/
│   │   ├── environment.ts
│   │   └── environment.prod.ts
│   └── app/
│       ├── app.component.ts
│       ├── app.config.ts
│       ├── app.routes.ts
│       ├── layout/
│       │   └── layout.component.ts
│       ├── pages/
│       │   ├── chat/
│       │   │   ├── chat-page.component.ts
│       │   │   ├── message-list.component.ts
│       │   │   ├── message-bubble.component.ts
│       │   │   ├── tool-call-chip.component.ts
│       │   │   ├── approval-dialog.component.ts
│       │   │   ├── chat-input.component.ts
│       │   │   └── suggestion-chips.component.ts
│       │   └── settings/
│       │       └── settings-page.component.ts
│       ├── services/
│       │   ├── chat-api.service.ts
│       │   ├── conversation.service.ts
│       │   ├── settings.service.ts
│       │   └── markdown.service.ts
│       └── models/
│           └── types.ts
deployments/chat-frontend/
├── Chart.yaml
├── application.yaml
├── values.yaml
└── templates/
    ├── _helpers.tpl
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    └── configmap.yaml
```

---

## Implementation Phases

### Phase 1 — Scaffold & Basic Chat (MVP)
1. Generate Nx app (`chat-frontend`), configure `project.json`, environments, PrimeNG Aura theme
2. Build `LayoutComponent` with sidebar shell (conversation list, new chat button)
3. Build `ChatInputComponent` with auto-grow textarea and send button
4. Build `ChatApiService` with `streamChat()` NDJSON streaming
5. Build `ConversationService` with signals + localStorage persistence
6. Build `MessageBubbleComponent` with basic markdown rendering via `marked`
7. Build `MessageListComponent` with auto-scroll
8. Wire up `ChatPageComponent` — send messages, stream responses, display tokens in real-time
9. **Milestone:** Can have a basic multi-turn conversation with streaming

### Phase 2 — Rich Features
1. Add `ModelSelectorComponent` (fetch models from `/agents/models`)
2. Add `ToolCallChipComponent` with expandable input/output
3. Add `ApprovalDialogComponent` for tool approval workflow
4. Add thinking/reasoning collapsible sections in assistant bubbles
5. Add delegation visibility (sub-agent chips)
6. Add stop generation button (AbortController)
7. Add `SuggestionChipsComponent` for empty state
8. **Milestone:** Full tool-call visibility and approval workflow working

### Phase 3 — File Upload & Vision
1. Add file attachment button to `ChatInputComponent`
2. Add drag-and-drop zone on chat area
3. Convert uploaded images to base64, add to message `images` array
4. Read text files (.txt, .md, .json, .csv, code files) and inline content as text in the message
5. Show image thumbnails and file name chips in user message bubbles
6. Auto-select a vision-capable model when images are attached
7. **Milestone:** Can send images/files and get appropriate model responses

### Phase 4 — Settings & Polish
1. Build `SettingsPageComponent` with all preference controls
2. Add prompt template CRUD (save/load/delete templates)
3. Add tool enable/disable toggles by category
4. Add dark mode toggle (PrimeNG `darkModeSelector: '.dark-mode'`)
5. Add conversation export/import (JSON)
6. Add conversation search/filter in sidebar
7. Auto-generate conversation titles (immediate: first ~50 chars of user message; then background LLM call to refine)
8. Add keyboard shortcuts (Cmd+N new chat, Cmd+K search, etc.)
9. Add code block copy button and syntax highlighting
10. Add PrimeNG `Toast` for error notifications
11. **Milestone:** Fully polished, configurable chat experience

### Phase 5 — Deployment
1. Create all files from the **Deployment Reference** section above (Dockerfile, nginx.conf, Helm chart, ArgoCD application)
2. Add `container` target to `project.json` (already documented in Reference Files)
3. Add AI Chat entry to landing page's `appLinks` array (see Deployment Reference)
4. Run `bunx nx container chat-frontend` to build and push
5. **Milestone:** Live at `chat.elliott.haus`

---

## PrimeNG Components to Use

| Component         | Usage                                       |
| ----------------- | ------------------------------------------- |
| `Button`          | Send, stop, approve, reject, new chat, etc. |
| `Textarea`        | Chat input (auto-resize)                    |
| `Drawer`          | Mobile sidebar                              |
| `Dialog`          | Approval modal, confirmation dialogs        |
| `Select`          | Model selector                              |
| `Slider`          | Temperature setting                         |
| `ToggleSwitch`    | Tool toggles, dark mode                     |
| `InputText`       | Conversation rename, search, template name  |
| `Toast`           | Error/success notifications                 |
| `Tag`             | Tool call status chips                      |
| `ProgressSpinner` | Loading states, streaming indicator         |
| `Tooltip`         | Icon button labels                          |
| `Accordion`       | Thinking/reasoning sections, tool I/O       |
| `ScrollPanel`     | Message list scrollable area                |
| `Menu`            | Conversation context menu (rename, delete)  |
| `Chip`            | Suggestion prompts                          |
| `FileUpload`      | Image attachment (or custom drag-drop zone) |
| `Skeleton`        | Loading placeholders                        |

---

## Resolved Decisions

| Decision                          | Answer                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conversation title generation** | Both — auto-title from first ~50 chars of the user's first message immediately, then fire a background LLM call to refine it asynchronously |
| **System prompts**                | Global default system prompt in settings (applies to all new conversations) + per-conversation override when starting a new chat            |
| **File attachments**              | Images (JPEG, PNG, GIF, WebP → base64 for vision models) + text files (.txt, .md, .json, .csv, common code extensions → inlined as text)    |
| **Theme color**                   | Blue primary color palette (Aura preset with `{blue.50}` through `{blue.950}`)                                                              |
| **Conversation storage**          | `localStorage` only — no backend persistence, no auth needed                                                                                |
| **Authentication**                | None — cluster is network-protected                                                                                                         |
