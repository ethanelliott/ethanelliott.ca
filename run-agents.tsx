#!/usr/bin/env bun
/**
 * run-agents.tsx
 *
 * TUI agent pool runner — spawns N opencode agents that each claim a task
 * from the kanban board, do the work, open a PR, and transition to IN_REVIEW.
 * Live terminal dashboard shows concurrent agent progress with ink.
 *
 * Usage:
 *   bun run-agents.tsx [options]
 *
 * Options:
 *   -p, --project <name>     Kanban project to pull tasks from
 *   -c, --count <n>          Number of parallel agents       (default: 2)
 *   -a, --api <url>          Kanban API base URL              (default: http://localhost:3333)
 *   -m, --model <model>      opencode model flag
 *   -l, --loop               Keep pool full indefinitely
 *   -d, --delay <seconds>    Seconds before respawning        (default: 5)
 *   -i, --interactive        Interactive setup prompts
 */

import { useState, useEffect, useCallback, useRef, type FC } from 'react';
import { render, Box, Text, useApp, useStdout } from 'ink';
import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import { resolve } from 'path';
import { mkdirSync, createWriteStream } from 'fs';
import { PassThrough, Writable } from 'stream';

// ═══════════════════════════════════════════════════════════════
// Alternate screen buffer + stdout proxy (flicker-free rendering)
// ═══════════════════════════════════════════════════════════════

const ESC_CURSOR_HOME = '\x1b[H'; // Move cursor to row 1, col 1
const ESC_CLEAR_TO_EOL = '\x1b[K'; // Clear from cursor to end of line
const ESC_CLEAR_TO_EOS = '\x1b[J'; // Clear from cursor to end of screen
const ESC_ALT_SCREEN_ON = '\x1b[?1049h'; // Enter alternate screen buffer
const ESC_ALT_SCREEN_OFF = '\x1b[?1049l'; // Leave alternate screen buffer
const ESC_HIDE_CURSOR = '\x1b[?25l'; // Hide cursor
const ESC_SHOW_CURSOR = '\x1b[?25h'; // Show cursor
const ESC_MOUSE_ON = '\x1b[?1000h\x1b[?1006h'; // Enable mouse tracking (SGR mode)
const ESC_MOUSE_OFF = '\x1b[?1000l\x1b[?1006l'; // Disable mouse tracking

// Regex to detect destructive clear sequences that ink emits in fullscreen mode
const RIS_RE = /\x1bc/g; // Reset to Initial State (terminal flash)
const CLEAR_SCREEN_RE = /\x1b\[2J/g; // Clear entire screen
const CLEAR_SCROLLBACK_RE = /\x1b\[3J/g; // Clear scrollback buffer

/**
 * Creates a Writable proxy around process.stdout that intercepts ink's
 * destructive fullscreen clear (\x1bc = RIS) and replaces it with
 * cursor-home + per-line clear-to-end-of-line writes.
 *
 * This eliminates the full-terminal flash that occurs when ink detects
 * its output fills the terminal height (its "fullscreen" code path
 * bypasses incrementalRendering and emits clearTerminal = \x1bc).
 */
function createStdoutProxy(): Writable & {
  rows: number;
  columns: number;
  isTTY: boolean;
} {
  const real = process.stdout;

  const proxy = new Writable({
    write(
      chunk: Buffer | string,
      encoding: BufferEncoding,
      callback: (error?: Error | null) => void
    ) {
      let str = typeof chunk === 'string' ? chunk : chunk.toString();

      // Strip the destructive sequences
      const hadRIS = RIS_RE.test(str);
      str = str.replace(RIS_RE, '');
      str = str.replace(CLEAR_SCREEN_RE, '');
      str = str.replace(CLEAR_SCROLLBACK_RE, '');

      if (hadRIS) {
        // Ink intended a full redraw — move cursor home and rewrite with per-line clears
        const lines = str.split('\n');
        let output = ESC_CURSOR_HOME;
        for (let i = 0; i < lines.length; i++) {
          output += lines[i] + ESC_CLEAR_TO_EOL;
          if (i < lines.length - 1) {
            output += '\n';
          }
        }
        // Clear any leftover lines below the new content
        output += ESC_CLEAR_TO_EOS;
        real.write(output, encoding, callback);
      } else {
        // No destructive sequences — pass through unchanged
        real.write(str, encoding, callback);
      }
    },
  }) as any;

  // Proxy the properties ink checks
  Object.defineProperty(proxy, 'rows', { get: () => real.rows });
  Object.defineProperty(proxy, 'columns', { get: () => real.columns });
  Object.defineProperty(proxy, 'isTTY', { get: () => real.isTTY });

  // Forward resize events so ink recalculates layout
  real.on('resize', () => proxy.emit('resize'));

  return proxy;
}

let altScreenActive = false;

function enterAltScreen() {
  if (!altScreenActive) {
    process.stdout.write(
      ESC_ALT_SCREEN_ON + ESC_HIDE_CURSOR + ESC_CURSOR_HOME + ESC_MOUSE_ON
    );
    altScreenActive = true;
  }
}

function leaveAltScreen() {
  if (altScreenActive) {
    process.stdout.write(ESC_MOUSE_OFF + ESC_SHOW_CURSOR + ESC_ALT_SCREEN_OFF);
    altScreenActive = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const AGENT_NAMES = [
  'Ada',
  'Turing',
  'Grace',
  'Knuth',
  'Dijkstra',
  'Linus',
  'Ritchie',
  'Thompson',
  'Gosling',
  'Wozniak',
  'Hopper',
  'Lovelace',
  'Babbage',
  'Stallman',
  'Torvalds',
  'Boole',
  'Shannon',
  'Neumann',
  'McCarthy',
  'Liskov',
];

const SLOT_COLORS = [
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#60a5fa',
  '#c084fc',
  '#22d3ee',
  '#fb923c',
  '#a3e635',
  '#e879f9',
  '#f472b6',
  '#2dd4bf',
  '#fcd34d',
  '#818cf8',
  '#4ade80',
  '#f9a8d4',
  '#a78bfa',
  '#67e8f9',
  '#fdba74',
  '#86efac',
  '#d8b4fe',
];

const MAX_BUFFER_LINES = 1000;
const FLUSH_INTERVAL_MS = 100;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Layout constants
const HEADER_ROWS = 4; // double-border top (1) + content (1) + double-border bottom (1) + agent names (1)
const FOOTER_ROWS = 1;
const PANEL_CHROME = 3; // round-border top (1) + panel header line (1) + round-border bottom (1)

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Config {
  project: string | null;
  count: number;
  api: string;
  model: string | null;
  loop: boolean;
  delay: number;
}

type AgentStatus = 'idle' | 'starting' | 'running' | 'done' | 'error';

/** Mutable agent data — lives in a ref, never in React state directly */
interface AgentData {
  name: string;
  color: string;
  status: AgentStatus;
  lines: string[];
  scrollOffset: number; // 0 = pinned to bottom, >0 = lines scrolled up from bottom
  startTime: number | null;
  endTime: number | null;
  exitCode: number | null;
  logPath: string | null;
  iteration: number;
  dirty: boolean; // true when mutated since last flush
}

/** Snapshot passed to React for rendering — immutable between flushes.
 *  Pre-computed strings (spinnerFrame, duration) are baked in so that
 *  React components are pure and unchanged lines stay identical for
 *  ink's incremental renderer. */
interface AgentSnapshot {
  name: string;
  color: string;
  status: AgentStatus;
  lines: string[];
  scrollOffset: number;
  focused: boolean;
  exitCode: number | null;
  logPath: string | null;
  iteration: number;
  /** Pre-computed spinner character (only set when running/starting) */
  spinnerFrame: string;
  /** Pre-computed duration string */
  duration: string;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function slotName(i: number): string {
  return AGENT_NAMES[(i - 1) % AGENT_NAMES.length];
}

function slotColor(i: number): string {
  return SLOT_COLORS[(i - 1) % SLOT_COLORS.length];
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ═══════════════════════════════════════════════════════════════
// Log directory
// ═══════════════════════════════════════════════════════════════

const SCRIPT_DIR =
  import.meta.dir && !import.meta.dir.startsWith('/$bunfs')
    ? import.meta.dir
    : process.cwd();

const LOG_DIR = resolve(SCRIPT_DIR, '.agent-logs');
mkdirSync(LOG_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════
// Module-level process tracking (accessible from main + React)
// ═══════════════════════════════════════════════════════════════

const activeProcs = new Map<string, ReturnType<typeof Bun.spawn>>();
let shutdownRequested = false;

// Commands from stdin -> React (processed by flush interval)
type PoolCommand =
  | { type: 'add' }
  | { type: 'remove' }
  | { type: 'kill'; index: number }
  | { type: 'restart'; index: number };
const pendingCommands: PoolCommand[] = [];

// Focus & scroll state — mutated from stdin handler, read by flush interval.
// Lives at module level so both the stdin handler (in main()) and the React
// component (via flush interval) can access it without threading through refs.
let focusedIndex = -1; // -1 = no panel focused
let focusDirty = false;
let moduleAgentData: AgentData[] = []; // Set once by App init, same array ref
let currentLayout = { panelHeight: 10, maxLines: 7, agentCount: 2 };

// ═══════════════════════════════════════════════════════════════
// Input event parser — raw stdin escape sequence decoder
// ═══════════════════════════════════════════════════════════════

type InputEvent =
  | { type: 'char'; char: string }
  | { type: 'ctrl-c' }
  | { type: 'tab' }
  | { type: 'shift-tab' }
  | { type: 'escape' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'page-up' }
  | { type: 'page-down' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'wheel-up'; row: number; col: number }
  | { type: 'wheel-down'; row: number; col: number };

/** Parse raw stdin buffer into structured input events */
function parseInputEvents(data: Buffer): InputEvent[] {
  const events: InputEvent[] = [];
  const str = data.toString();
  let i = 0;

  while (i < str.length) {
    if (str[i] === '\x1b') {
      // CSI sequence: \x1b[...
      if (i + 1 < str.length && str[i + 1] === '[') {
        // SGR mouse: \x1b[<button;col;rowM
        if (i + 2 < str.length && str[i + 2] === '<') {
          const rest = str.slice(i);
          const match = rest.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
          if (match) {
            const button = parseInt(match[1]);
            const col = parseInt(match[2]);
            const row = parseInt(match[3]);
            if (button === 64) events.push({ type: 'wheel-up', row, col });
            else if (button === 65)
              events.push({ type: 'wheel-down', row, col });
            // Ignore other mouse buttons (press/release) — we only want wheel
            i += match[0].length;
            continue;
          }
        }
        // Arrow keys
        if (i + 2 < str.length) {
          if (str[i + 2] === 'A') {
            events.push({ type: 'up' });
            i += 3;
            continue;
          }
          if (str[i + 2] === 'B') {
            events.push({ type: 'down' });
            i += 3;
            continue;
          }
          // Shift+Tab
          if (str[i + 2] === 'Z') {
            events.push({ type: 'shift-tab' });
            i += 3;
            continue;
          }
          // Page Up/Down: \x1b[5~ / \x1b[6~
          if (i + 3 < str.length && str[i + 3] === '~') {
            if (str[i + 2] === '5') {
              events.push({ type: 'page-up' });
              i += 4;
              continue;
            }
            if (str[i + 2] === '6') {
              events.push({ type: 'page-down' });
              i += 4;
              continue;
            }
          }
          // Home/End: \x1b[H / \x1b[F
          if (str[i + 2] === 'H') {
            events.push({ type: 'home' });
            i += 3;
            continue;
          }
          if (str[i + 2] === 'F') {
            events.push({ type: 'end' });
            i += 3;
            continue;
          }
        }
        // Unknown CSI — skip the \x1b[ and continue
        i += 2;
        continue;
      }
      // SS3 sequence: \x1bO...
      if (i + 1 < str.length && str[i + 1] === 'O') {
        if (i + 2 < str.length) {
          if (str[i + 2] === 'H') {
            events.push({ type: 'home' });
            i += 3;
            continue;
          }
          if (str[i + 2] === 'F') {
            events.push({ type: 'end' });
            i += 3;
            continue;
          }
        }
        i += 2;
        continue;
      }
      // Bare escape (no following character in this buffer)
      if (i + 1 >= str.length) {
        events.push({ type: 'escape' });
        i++;
        continue;
      }
      // Unknown escape — skip
      i++;
      continue;
    }

    // Tab
    if (str[i] === '\x09') {
      events.push({ type: 'tab' });
      i++;
      continue;
    }
    // Ctrl+C
    if (str[i] === '\x03') {
      events.push({ type: 'ctrl-c' });
      i++;
      continue;
    }
    // Regular character
    events.push({ type: 'char', char: str[i] });
    i++;
  }

  return events;
}

// ═══════════════════════════════════════════════════════════════
// SSE client + work dispatcher (event-driven agent activation)
// ═══════════════════════════════════════════════════════════════

const SSE_DEBOUNCE_MS = 5_000; // Wait 5s after last relevant event before dispatching
const SSE_RECONNECT_MS = 3_000; // Reconnect after 3s if SSE drops

/** Fetch the count of unassigned actionable tasks */
async function fetchAvailableCounts(
  api: string,
  project: string | null
): Promise<{ todo: number; changesRequested: number }> {
  const url = new URL(`${api}/tasks/counts`);
  if (project) url.searchParams.set('project', project);
  const resp = await fetch(url.toString());
  if (!resp.ok) return { todo: 0, changesRequested: 0 };
  return resp.json();
}

type SseStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Creates an SSE connection to the kanban backend using raw fetch (Bun has no
 * EventSource global) and calls `onWorkAvailable` (debounced) whenever tasks
 * move to actionable states.
 * Also does an immediate count check on connect (in case tasks are already waiting).
 *
 * Accepts refs so the caller can swap callbacks without tearing down the
 * connection (avoids useEffect dependency churn).
 */
function createWorkWatcher(opts: {
  api: string;
  project: string | null;
  onWorkAvailableRef: { current: () => void };
  onStatusChange: (status: SseStatus) => void;
}): () => void {
  const { api, project, onWorkAvailableRef, onStatusChange } = opts;
  let abortController: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function scheduleDispatch() {
    if (closed) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!closed) onWorkAvailableRef.current();
    }, SSE_DEBOUNCE_MS);
  }

  /** Parse a single SSE event and trigger dispatch if relevant */
  function handleEvent(eventType: string, data: string) {
    if (eventType === 'task_created' || eventType === 'task_updated') {
      try {
        const parsed = JSON.parse(data);
        const state = parsed?.payload?.state;
        if (state === 'TODO' || state === 'CHANGES_REQUESTED') {
          scheduleDispatch();
        }
      } catch {}
    } else if (eventType === 'task_expired') {
      // Expired tasks go back to TODO
      scheduleDispatch();
    }
    // heartbeat and other events are silently ignored
  }

  async function connect() {
    if (closed) return;

    onStatusChange('connecting');

    const url = new URL(`${api}/tasks/events`);
    if (project) url.searchParams.set('project', project);

    abortController = new AbortController();

    try {
      const resp = await fetch(url.toString(), {
        signal: abortController.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`SSE connect failed: ${resp.status}`);
      }

      onStatusChange('connected');

      // Connected — do an immediate check for waiting work
      onWorkAvailableRef.current();

      // Read the SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let currentData = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '') {
            // Blank line = end of SSE message
            if (currentEvent && currentData) {
              handleEvent(currentEvent, currentData);
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err: unknown) {
      // AbortError is expected during cleanup
      if (err instanceof Error && err.name === 'AbortError') return;
    }

    // Stream ended or errored — reconnect unless closed
    abortController = null;
    if (!closed) {
      onStatusChange('disconnected');
      reconnectTimer = setTimeout(connect, SSE_RECONNECT_MS);
    }
  }

  connect();

  return () => {
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    abortController?.abort();
    abortController = null;
  };
}

// ═══════════════════════════════════════════════════════════════
// Agent prompt builder
// ═══════════════════════════════════════════════════════════════

function buildPrompt(agentId: string, config: Config): string {
  const API = config.api;
  const PROJECT = config.project;

  const projectScope = PROJECT
    ? `project "${PROJECT}"`
    : 'any project (pick the highest-priority eligible task across all projects)';
  const nextBody = PROJECT
    ? `{ "assignee": "${agentId}", "project": "${PROJECT}" }`
    : `{ "assignee": "${agentId}" }`;

  return `
You are an autonomous coding agent named "${agentId}".
Your job is to complete exactly ONE task from the kanban board, then stop.
You are working on ${projectScope}.

---

## Ongoing Rule: Leave Activity Comments Constantly

Post a comment to the activity log whenever you:
- Claim a task
- Create a worktree (include the exact path)
- Create or check out a branch (include the branch name)
- Decide on an implementation approach (explain what and why)
- Run a build or test (note pass/fail and any key output)
- Commit changes (include the commit SHA and short message)
- Open or update a PR (include the full PR URL)
- Reference any external resource (docs, other PRs, issues)
- Encounter something unexpected or make a non-obvious choice
- Transition the task's state

The API call for all comments is:

  POST ${API}/tasks/<task-id>/activity
  Content-Type: application/json
  { "type": "comment", "author": "${agentId}", "content": "<your message>" }

Be specific. A reviewer reading only the activity log should be able to
understand exactly what you did and why, without looking at the diff.

---

## Step 1 — Claim a task

Make this API call to atomically claim the next available task:

  POST ${API}/tasks/next
  Content-Type: application/json
  ${nextBody}

- If 404: no eligible tasks available. Stop immediately — do NOT post anything.
- If 409: you already have a task in progress. This should not happen on a fresh run.
- On success (200): you receive the full task object, already transitioned to
  IN_PROGRESS and assigned to you. Note the "id", "title", "description", and
  "directory" fields.

Post activity comment immediately:
  "Claimed task. Starting work."

---

## Step 2 — Determine the task path

Call the history endpoint to find the previous state:

  GET ${API}/tasks/<task-id>/history

Look at the most recent transition entry (last item). If its "fromState" was
"CHANGES_REQUESTED", follow **Path B** (review fixes). Otherwise follow **Path A**
(fresh implementation).

Post activity comment:
  "Prior state was <fromState>. Following Path <A|B>."

---

## ═══════════════════════════════════════╗
## PATH A — Fresh task (fromState: TODO)  ║
## ═══════════════════════════════════════╝

### A1 — Set up a git worktree

First, discover where worktrees live in this repo:

  git worktree list

Look at the existing worktree paths. If any sibling worktrees exist, they
will share a common parent directory — use that same parent. If none exist
yet, the convention is a sibling directory named <reponame>.worktrees:

  REPO_ROOT=$(git rev-parse --show-toplevel)
  REPO_NAME=$(basename "$REPO_ROOT")
  WORKTREE_BASE="$(dirname "$REPO_ROOT")/\${REPO_NAME}.worktrees"
  mkdir -p "$WORKTREE_BASE"

  BRANCH="task/${agentId}-<task-id>"
  WORKTREE_PATH="\${WORKTREE_BASE}/${agentId}-<task-id>"
  git worktree add -b "$BRANCH" "$WORKTREE_PATH"
  cd "$WORKTREE_PATH"

If the task has a "directory" field set, cd into that subdirectory as well.
All subsequent file edits and commands must happen inside this worktree.

Post activity comment:
  "Worktree created at <WORKTREE_PATH>. Branch: <BRANCH>."

### A2 — Understand the task

Read the title and description carefully — they are your complete specification.
Post activity comment:
  "Plan: <1–3 sentence description of what you are going to implement and how>."

### A3 — Implement

Follow all existing code conventions. Run builds and tests to verify correctness.

Post activity comments as you work:
- When you decide on a significant design choice: "Decision: <what and why>"
- After a successful build: "Build passed."
- After a failing build and your fix: "Build failed with <error>. Fixed by <what>."

Commit with a conventional commit message referencing the task title.
Post activity comment:
  "Committed: <SHA> — <commit subject line>."

### A4 — Open a Pull Request

Create a PR on GitHub from your branch to main. Write a clear title and body
summarising what changed and why.

Post activity comment:
  "PR opened: <full PR URL> — <PR title>."

### A5 — Transition to IN_REVIEW

  PATCH ${API}/tasks/<task-id>/transition
  Content-Type: application/json
  { "state": "IN_REVIEW" }

Post activity comment:
  "Transitioned to IN_REVIEW. Ready for review: <PR URL>."

---

## ══════════════════════════════════════════════════════════════╗
## PATH B — Address review comments (fromState: CHANGES_REQUESTED) ║
## ══════════════════════════════════════════════════════════════╝

### B1 — Find your existing PR

Read the task's activity log to locate the PR URL:

  GET ${API}/tasks/<task-id>/activity

Search through the entries for a comment containing a PR URL (look for
"PR opened:" or a github.com/…/pull/… link). That is your existing PR.

Post activity comment:
  "Found existing PR: <PR URL>. Reading review comments."

### B2 — Resume the worktree

Discover the worktree base the same way as Path A:

  REPO_ROOT=$(git rev-parse --show-toplevel)
  REPO_NAME=$(basename "$REPO_ROOT")
  WORKTREE_BASE="$(dirname "$REPO_ROOT")/\${REPO_NAME}.worktrees"
  BRANCH="task/<assignee from activity log>-<task-id>"
  WORKTREE_PATH="\${WORKTREE_BASE}/<assignee from activity log>-<task-id>"

(Read the original assignee and branch name from the task's activity log —
the "Worktree created" comment records the exact path and branch.)

- If the worktree directory already exists: cd into it and run \`git pull\`.
- If it doesn't exist but the branch does (machine rebooted, /tmp cleared, etc.):
    git worktree add "$WORKTREE_PATH" "$BRANCH"   # no -b flag — branch already exists
    cd "$WORKTREE_PATH"
- If neither exists (branch was deleted): recreate both:
    git worktree add -b "$BRANCH" "$WORKTREE_PATH"
    cd "$WORKTREE_PATH"

Post activity comment:
  "Resumed worktree at <path>, on branch <branch>."

### B3 — Read the review comments

Go to the PR on GitHub and read every review comment carefully.
Post activity comment:
  "Review comments summary: <bullet list of each requested change>."

### B4 — Address the comments

Make targeted fixes — only change what the review explicitly requests.

Post activity comments as you implement each fix:
  "Fixed: <what you changed and why>."

After committing:
  "Committed fixes: <SHA> — <commit subject line>."

### B5 — Push

Push to the same branch. The existing PR will update automatically.
Post activity comment:
  "Pushed to <branch>. PR <PR URL> updated with fixes."

### B6 — Transition to IN_REVIEW

  PATCH ${API}/tasks/<task-id>/transition
  Content-Type: application/json
  { "state": "IN_REVIEW" }

Post activity comment:
  "Re-submitted for review. PR: <PR URL>."

---

## Final Step — Stop

Your work is done. Do NOT claim another task. Exit cleanly.
Do NOT remove the worktree — leave it for the reviewer.

If at any point you are genuinely blocked or the task is ambiguous:

  PATCH ${API}/tasks/<task-id>/transition
  Content-Type: application/json
  { "state": "BLOCKED" }

Post an activity comment explaining exactly what is blocking you and what
information or action is needed to unblock.
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// Process spawning
// ═══════════════════════════════════════════════════════════════

interface SpawnResult {
  proc: ReturnType<typeof Bun.spawn>;
  logPath: string;
}

function spawnAgentProcess(
  name: string,
  config: Config,
  onLine: (line: string) => void,
  onExit: (code: number) => void
): SpawnResult {
  const logPath = `${LOG_DIR}/${name}-${Date.now()}.log`;
  const logStream = createWriteStream(logPath, { flags: 'a' });
  const prompt = buildPrompt(name, config);
  const modelFlag = config.model ? ['--model', config.model] : [];

  const proc = Bun.spawn(['opencode', 'run', ...modelFlag, prompt], {
    cwd: SCRIPT_DIR,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });

  async function pipeStream(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const text = decoder.decode(chunk);
      logStream.write(text);
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    }
  }

  Promise.all([pipeStream(proc.stdout), pipeStream(proc.stderr)]).finally(
    async () => {
      const code = await proc.exited;
      logStream.end();
      onExit(code);
    }
  );

  return { proc, logPath };
}

// ═══════════════════════════════════════════════════════════════
// Ink Components
// ═══════════════════════════════════════════════════════════════

// ── Header ───────────────────────────────────────────────────

const SSE_STATUS_ICON: Record<SseStatus, string> = {
  connecting: '◌',
  connected: '●',
  disconnected: '○',
};

const SSE_STATUS_COLOR: Record<SseStatus, string> = {
  connecting: 'yellow',
  connected: 'green',
  disconnected: 'red',
};

const Header: FC<{
  config: Config;
  agentCount: number;
  agentNames: string[];
  sseStatus: SseStatus;
}> = ({ config, agentCount, agentNames, sseStatus }) => (
  <Box flexDirection="column">
    <Box
      borderStyle="double"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text>
        <Text bold color="cyan">
          Agent Pool
        </Text>
        <Text dimColor> | </Text>
        <Text dimColor>project: </Text>
        <Text bold>{config.project ?? 'any'}</Text>
        <Text dimColor> | </Text>
        <Text dimColor>agents: </Text>
        <Text bold>{agentCount}</Text>
        <Text dimColor> | </Text>
        <Text dimColor>mode: </Text>
        <Text bold>{config.loop ? 'loop' : 'single-run'}</Text>
        <Text dimColor> | </Text>
        <Text color={SSE_STATUS_COLOR[sseStatus]}>
          {SSE_STATUS_ICON[sseStatus]}
        </Text>
        <Text dimColor> </Text>
        <Text dimColor>sse: </Text>
        <Text color={SSE_STATUS_COLOR[sseStatus]} bold>
          {sseStatus}
        </Text>
      </Text>
    </Box>
    <Box paddingX={1} gap={1}>
      {agentNames.map((name, i) => (
        <Text key={name} color={slotColor(i + 1)} bold>
          {name}
        </Text>
      ))}
    </Box>
  </Box>
);

// ── Agent Panel ──────────────────────────────────────────────

const STATUS_ICON: Record<AgentStatus, string> = {
  idle: '◯ ',
  starting: ' ',
  running: '',
  done: ' ',
  error: ' ',
};

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: 'gray',
  starting: 'yellow',
  running: 'cyan',
  done: 'green',
  error: 'red',
};

const AgentPanel: FC<{
  agent: AgentSnapshot;
  panelHeight: number;
  maxLines: number;
}> = ({ agent, panelHeight, maxLines }) => {
  const color = STATUS_COLOR[agent.status];
  const { duration, focused, scrollOffset } = agent;

  const totalLines = agent.lines.length;

  // ── Visible lines with scroll offset ───────────────────────
  // scrollOffset=0 means pinned to bottom (latest lines).
  // scrollOffset>0 means N lines scrolled up from the bottom.
  const clampedOffset = Math.min(
    scrollOffset,
    Math.max(0, totalLines - maxLines)
  );
  const endIdx = totalLines - clampedOffset;
  const startIdx = Math.max(0, endIdx - maxLines);
  const visibleLines = agent.lines.slice(startIdx, endIdx);
  while (visibleLines.length < maxLines) {
    visibleLines.push('');
  }

  const canScroll = totalLines > maxLines;
  const linesAbove = startIdx;
  const linesBelow = clampedOffset;

  // ── Scrollbar geometry ──────────────────────────────────────
  const trackHeight = maxLines;
  const thumbSize = canScroll
    ? Math.max(1, Math.round(trackHeight * (maxLines / totalLines)))
    : trackHeight;
  // Position thumb proportionally to the scroll position
  const maxOffset = Math.max(0, totalLines - maxLines);
  const scrollFraction =
    maxOffset > 0 ? (maxOffset - clampedOffset) / maxOffset : 1;
  const thumbTop = canScroll
    ? Math.round(scrollFraction * (trackHeight - thumbSize))
    : 0;

  const scrollbar = Array.from({ length: trackHeight }, (_, i) => {
    const isThumb = i >= thumbTop && i < thumbTop + thumbSize;
    return isThumb;
  });

  // ── Border styling: focused panels get bold borders ─────────
  const borderStyle = focused ? 'bold' : 'round';
  const borderColor = focused
    ? agent.color
    : agent.status === 'running'
    ? agent.color
    : color;

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle as any}
      borderColor={borderColor}
      paddingX={1}
      height={panelHeight}
      overflow="hidden"
    >
      {/* Panel header */}
      <Box justifyContent="space-between">
        <Text>
          {focused && <Text color={agent.color}>{'▸ '}</Text>}
          {agent.status === 'running' || agent.status === 'starting' ? (
            <Text color={agent.color}>{agent.spinnerFrame} </Text>
          ) : (
            <Text color={color}>{STATUS_ICON[agent.status]}</Text>
          )}
          <Text bold color={agent.color}>
            {agent.name}
          </Text>
          <Text dimColor>
            {' '}
            {agent.status.toUpperCase()}
            {duration ? ` (${duration})` : ''}
            {agent.iteration > 1 ? ` #${agent.iteration}` : ''}
          </Text>
          {canScroll && linesAbove > 0 && (
            <Text dimColor> [{linesAbove}↑]</Text>
          )}
          {linesBelow > 0 && <Text color="yellow"> [{linesBelow}↓]</Text>}
        </Text>
        {agent.logPath && (
          <Text dimColor italic>
            {agent.logPath.split('/').pop()}
          </Text>
        )}
      </Box>

      {/* Log output with scrollbar gutter */}
      <Box overflow="hidden">
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {visibleLines.map((line, i) => (
            <Text key={i} dimColor={line === ''} wrap="truncate">
              {line ||
                (i === 0 && totalLines === 0
                  ? agent.status === 'idle'
                    ? 'Waiting for work...'
                    : agent.status === 'starting'
                    ? 'Spawning opencode...'
                    : agent.status === 'done'
                    ? 'Finished.'
                    : agent.status === 'error'
                    ? `Exited with code ${agent.exitCode}`
                    : ' '
                  : ' ')}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width={1} marginLeft={1}>
          {scrollbar.map((isThumb, i) => (
            <Text
              key={i}
              color={isThumb ? agent.color : undefined}
              dimColor={!isThumb}
            >
              {isThumb ? '▓' : '░'}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

// ── Footer ───────────────────────────────────────────────────

const Footer: FC<{
  stats: { completed: number; failed: number };
  uptime: string;
  shuttingDown: boolean;
  loop: boolean;
  hasFocus: boolean;
}> = ({ stats, uptime, shuttingDown, hasFocus }) => (
  <Box paddingX={1} justifyContent="space-between">
    <Text>
      <Text color="green" bold>
        {stats.completed}
      </Text>
      <Text color="green"> done</Text>
      <Text dimColor>{' | '}</Text>
      <Text color="red" bold>
        {stats.failed}
      </Text>
      <Text color="red"> failed</Text>
      <Text dimColor>{' | '}</Text>
      <Text dimColor>uptime </Text>
      <Text>{uptime}</Text>
    </Text>
    <Text dimColor>
      {shuttingDown ? (
        <Text color="yellow" bold>
          shutting down...
        </Text>
      ) : hasFocus ? (
        <Text>
          <Text bold>↑↓</Text> scroll
          {'  '}
          <Text bold>PgUp/Dn</Text> page
          {'  '}
          <Text bold>Esc</Text> unfocus
          {'  '}
          <Text bold>r</Text> restart
          {'  '}
          <Text bold>x</Text> kill
        </Text>
      ) : (
        <Text>
          <Text bold>q</Text> quit
          {'  '}
          <Text bold>Tab</Text> focus
          {'  '}
          <Text bold>k</Text> add agent
          {'  '}
          <Text bold>j</Text> remove agent
        </Text>
      )}
    </Text>
  </Box>
);

// ── Main App ─────────────────────────────────────────────────

const App: FC<{ config: Config }> = ({ config }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const appStartTime = useRef(Date.now());

  // ── Mutable refs for agent data and stats ──────────────────
  // Process callbacks mutate these directly — no setState per line.
  const dataRef = useRef<AgentData[]>(
    Array.from({ length: config.count }, (_, i) => ({
      name: slotName(i + 1),
      color: slotColor(i + 1),
      status: 'idle' as AgentStatus,
      lines: [],
      scrollOffset: 0,
      startTime: null,
      endTime: null,
      exitCode: null,
      logPath: null,
      iteration: 0,
      dirty: true,
    }))
  );
  // Expose to module-level so stdin handler can access agent data
  moduleAgentData = dataRef.current;
  const statsRef = useRef({ completed: 0, failed: 0, dirty: true });
  const spinnerIndexRef = useRef(0);
  // Tracks the next slot number for unique naming (monotonically increasing)
  const nextSlotNumRef = useRef(config.count + 1);

  // ── Display state — updated only by the flush interval ─────
  const [agents, setAgents] = useState<AgentSnapshot[]>(() =>
    dataRef.current.map(
      ({ dirty: _, startTime: _s, endTime: _e, ...rest }) => ({
        ...rest,
        focused: false,
        spinnerFrame: '',
        duration: '',
      })
    )
  );
  const [stats, setStats] = useState({ completed: 0, failed: 0 });
  const [uptime, setUptime] = useState('0s');
  const [shuttingDown, setShuttingDown] = useState(false);
  const sseStatusRef = useRef<SseStatus>('disconnected');
  const [sseStatus, setSseStatus] = useState<SseStatus>('disconnected');

  // ── Terminal size tracking ─────────────────────────────────
  const [termRows, setTermRows] = useState(stdout?.rows ?? 40);

  useEffect(() => {
    const onResize = () => {
      if (stdout?.rows) setTermRows(stdout.rows);
    };
    stdout?.on('resize', onResize);
    return () => {
      stdout?.off('resize', onResize);
    };
  }, [stdout]);

  // ── Dispatcher ref — breaks circular dependency between spawnForSlot and dispatchWork ──
  const dispatchWorkRef = useRef<() => void>(() => {});

  // Spawn an agent for a given slot index
  const spawnForSlot = useCallback(
    (slotIndex: number) => {
      if (shutdownRequested) return;

      const d = dataRef.current[slotIndex];
      if (!d) return;
      const name = d.name;

      // Reset slot data
      d.status = 'starting';
      d.lines = [];
      d.scrollOffset = 0;
      d.startTime = Date.now();
      d.endTime = null;
      d.exitCode = null;
      d.logPath = null;
      d.iteration += 1;
      d.dirty = true;

      const { proc, logPath } = spawnAgentProcess(
        name,
        config,
        (line) => {
          // Mutate ref directly — no setState per line.
          // Guard: slot may have been removed while output was buffered
          if (!dataRef.current.includes(d)) return;
          d.status = 'running';
          if (d.lines.length >= MAX_BUFFER_LINES) {
            const trimCount = d.lines.length - (MAX_BUFFER_LINES - 1);
            d.lines = d.lines.slice(-(MAX_BUFFER_LINES - 1));
            // Adjust scroll offset when old lines are trimmed
            d.scrollOffset = Math.max(0, d.scrollOffset - trimCount);
          }
          // If user has scrolled up, keep their viewport stable
          if (d.scrollOffset > 0) d.scrollOffset++;
          d.lines.push(line);
          d.dirty = true;
        },
        (code) => {
          // Guard: slot may have been removed
          if (!dataRef.current.includes(d)) {
            activeProcs.delete(name);
            if (code === 0) statsRef.current.completed++;
            else statsRef.current.failed++;
            statsRef.current.dirty = true;
            return;
          }
          d.status = code === 0 ? 'done' : 'error';
          d.exitCode = code;
          d.endTime = Date.now();
          d.dirty = true;

          if (code === 0) statsRef.current.completed++;
          else statsRef.current.failed++;
          statsRef.current.dirty = true;

          activeProcs.delete(name);

          // After finishing, check if more work is available and dispatch
          if (!shutdownRequested) {
            // Small delay to let the task transition settle on the backend
            setTimeout(() => dispatchWorkRef.current(), config.delay * 1000);
          }
        }
      );

      d.logPath = logPath;
      d.dirty = true;
      activeProcs.set(name, proc);
    },
    [config]
  );

  // ── Dispatcher: fetch counts + activate idle agents ────────
  const dispatchingRef = useRef(false);

  const dispatchWork = useCallback(async () => {
    if (shutdownRequested || dispatchingRef.current) return;
    dispatchingRef.current = true;

    try {
      const counts = await fetchAvailableCounts(config.api, config.project);
      const available = counts.todo + counts.changesRequested;
      if (available <= 0) return;

      // Find idle slots
      const idleIndices: number[] = [];
      for (let i = 0; i < dataRef.current.length; i++) {
        const d = dataRef.current[i];
        if (
          d.status === 'idle' ||
          d.status === 'done' ||
          d.status === 'error'
        ) {
          idleIndices.push(i);
        }
      }

      // Activate min(idle, available) agents
      const toSpawn = Math.min(idleIndices.length, available);
      for (let i = 0; i < toSpawn; i++) {
        spawnForSlot(idleIndices[i]);
      }
    } catch {
      // Network error — SSE reconnect will trigger another check
    } finally {
      dispatchingRef.current = false;
    }
  }, [config, spawnForSlot]);

  // Keep the dispatch ref current
  useEffect(() => {
    dispatchWorkRef.current = dispatchWork;
  }, [dispatchWork]);

  // ── Single flush interval — the ONLY source of React re-renders ──
  useEffect(() => {
    let prevUptime = '';
    const id = setInterval(() => {
      // Advance spinner (module-level index, no React state)
      spinnerIndexRef.current =
        (spinnerIndexRef.current + 1) % SPINNER_FRAMES.length;
      const frame = SPINNER_FRAMES[spinnerIndexRef.current];

      // Process pending commands
      let sizeChanged = false;
      while (pendingCommands.length > 0) {
        const cmd = pendingCommands.shift()!;
        if (cmd.type === 'add') {
          const num = nextSlotNumRef.current++;
          const newSlot: AgentData = {
            name: slotName(num),
            color: slotColor(num),
            status: 'idle',
            lines: [],
            scrollOffset: 0,
            startTime: null,
            endTime: null,
            exitCode: null,
            logPath: null,
            iteration: 0,
            dirty: true,
          };
          dataRef.current.push(newSlot);
          sizeChanged = true;
          // Trigger a dispatch check — new idle slot may pick up waiting work
          dispatchWorkRef.current();
        } else if (cmd.type === 'remove' && dataRef.current.length > 1) {
          const removed = dataRef.current.pop()!;
          removed.dirty = true;
          sizeChanged = true;
          // Kill its process if active
          const proc = activeProcs.get(removed.name);
          if (proc) {
            try {
              proc.kill('SIGTERM');
            } catch {}
            activeProcs.delete(removed.name);
          }
          // Adjust focus if it pointed at or past the removed slot
          if (focusedIndex >= dataRef.current.length) {
            focusedIndex = dataRef.current.length - 1;
            focusDirty = true;
          }
        } else if (cmd.type === 'kill') {
          const d = dataRef.current[cmd.index];
          if (d && (d.status === 'running' || d.status === 'starting')) {
            const proc = activeProcs.get(d.name);
            if (proc) {
              try {
                proc.kill('SIGTERM');
              } catch {}
            }
          }
        } else if (cmd.type === 'restart') {
          const d = dataRef.current[cmd.index];
          if (d) {
            // Kill existing process if running
            const proc = activeProcs.get(d.name);
            if (proc) {
              try {
                proc.kill('SIGTERM');
              } catch {}
              activeProcs.delete(d.name);
            }
            // Reset to idle so dispatcher picks it up
            d.status = 'idle';
            d.lines = [];
            d.scrollOffset = 0;
            d.startTime = null;
            d.endTime = null;
            d.exitCode = null;
            d.logPath = null;
            d.dirty = true;
            // Dispatch immediately
            dispatchWorkRef.current();
          }
        }
      }

      // Check if any agent data is dirty
      let anyDirty = sizeChanged || focusDirty;
      focusDirty = false;
      for (const d of dataRef.current) {
        if (d.dirty) {
          anyDirty = true;
          break;
        }
      }

      // Check if any agent is actively running (spinner/duration ticking)
      const hasActive = dataRef.current.some(
        (d) => d.status === 'running' || d.status === 'starting'
      );

      // Compute uptime string — only triggers re-render when it changes
      const newUptime = elapsed(Date.now() - appStartTime.current);
      const uptimeChanged = newUptime !== prevUptime;
      prevUptime = newUptime;

      // If nothing changed, skip the re-render entirely
      if (
        !anyDirty &&
        !hasActive &&
        !uptimeChanged &&
        !statsRef.current.dirty
      ) {
        return;
      }

      // Build snapshots with pre-computed spinner + duration
      const now = Date.now();
      setAgents(
        dataRef.current.map((d, i) => {
          d.dirty = false;
          const duration =
            d.startTime != null
              ? elapsed((d.endTime ?? now) - d.startTime)
              : '';
          const sf =
            d.status === 'running' || d.status === 'starting' ? frame : '';
          return {
            name: d.name,
            color: d.color,
            status: d.status,
            lines: [...d.lines],
            scrollOffset: d.scrollOffset,
            focused: i === focusedIndex,
            exitCode: d.exitCode,
            logPath: d.logPath,
            iteration: d.iteration,
            spinnerFrame: sf,
            duration,
          };
        })
      );

      // Flush stats if dirty
      if (statsRef.current.dirty) {
        statsRef.current.dirty = false;
        setStats({
          completed: statsRef.current.completed,
          failed: statsRef.current.failed,
        });
      }

      if (uptimeChanged) {
        setUptime(newUptime);
      }

      // Sync shutdown state from module-level flag
      if (shutdownRequested) {
        setShuttingDown(true);
      }

      // Sync SSE connection status from ref
      setSseStatus((prev) =>
        prev !== sseStatusRef.current ? sseStatusRef.current : prev
      );

      // Sync layout geometry for the stdin handler (mouse wheel mapping)
      const agentCount = dataRef.current.length;
      const avail = (stdout?.rows ?? 40) - HEADER_ROWS - FOOTER_ROWS;
      const ph = Math.max(PANEL_CHROME + 1, Math.floor(avail / agentCount));
      const ml = Math.max(1, ph - PANEL_CHROME);
      currentLayout = { panelHeight: ph, maxLines: ml, agentCount };
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — uses refs only

  // ── SSE watcher — listens for work and dispatches agents ────
  useEffect(() => {
    // Connect to SSE and dispatch work when tasks become available.
    // Uses dispatchWorkRef so the callback stays current without
    // tearing down the SSE connection on every render cycle.
    const cleanup = createWorkWatcher({
      api: config.api,
      project: config.project,
      onWorkAvailableRef: dispatchWorkRef,
      onStatusChange: (status) => {
        sseStatusRef.current = status;
        // Don't call setSseStatus here — the flush interval syncs it
        // to avoid excessive re-renders.
      },
    });
    return cleanup;
  }, [config.api, config.project]); // eslint-disable-line react-hooks/exhaustive-deps — uses refs only

  // ── Eager startup check — dispatch immediately if tasks are already waiting ──
  // Independent of SSE: covers the case where work exists before the stream connects.
  const startupCheckedRef = useRef(false);
  useEffect(() => {
    if (startupCheckedRef.current) return;
    startupCheckedRef.current = true;
    // Small delay to let the dispatchWorkRef sync effect run first
    setTimeout(() => dispatchWorkRef.current(), 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — one-shot on mount

  // ── No auto-exit in event-driven mode ──────────────────────
  // In loop mode (default for event-driven), agents wait for work indefinitely.
  // In single-run mode, auto-exit only after at least one agent has run AND
  // all agents are idle/done/error AND no more work is available.
  const autoExitCheckedRef = useRef(false);
  useEffect(() => {
    if (config.loop) return; // never auto-exit in loop mode

    // Must have completed at least one task
    const hasRun = agents.some(
      (a) => a.status === 'done' || a.status === 'error'
    );
    const allQuiet = agents.every(
      (a) => a.status === 'idle' || a.status === 'done' || a.status === 'error'
    );

    if (!hasRun || !allQuiet) {
      autoExitCheckedRef.current = false;
      return;
    }

    // Double-check with the server that no work is left
    if (autoExitCheckedRef.current) return;
    autoExitCheckedRef.current = true;

    fetchAvailableCounts(config.api, config.project)
      .then((counts) => {
        if (counts.todo + counts.changesRequested === 0) {
          setTimeout(() => exit(), 2000);
        } else {
          autoExitCheckedRef.current = false;
          dispatchWork(); // there IS work — dispatch it
        }
      })
      .catch(() => {
        autoExitCheckedRef.current = false;
      });
  }, [agents, config.loop, config.api, config.project, exit, dispatchWork]);

  // ── Derived values ─────────────────────────────────────────
  const agentNames = agents.map((a) => a.name);
  const agentCount = agents.length;

  // ── Fixed layout geometry ──────────────────────────────────
  const availableForPanels = termRows - HEADER_ROWS - FOOTER_ROWS;
  const panelHeight = Math.max(
    PANEL_CHROME + 1,
    Math.floor(availableForPanels / agentCount)
  );
  const maxLines = Math.max(1, panelHeight - PANEL_CHROME);

  return (
    <Box flexDirection="column" height={termRows}>
      <Header
        config={config}
        agentCount={agentCount}
        agentNames={agentNames}
        sseStatus={sseStatus}
      />
      <Box flexDirection="column" flexGrow={1}>
        {agents.map((agent) => (
          <AgentPanel
            key={agent.name}
            agent={agent}
            panelHeight={panelHeight}
            maxLines={maxLines}
          />
        ))}
      </Box>
      <Footer
        stats={stats}
        uptime={uptime}
        shuttingDown={shuttingDown}
        loop={config.loop}
        hasFocus={agents.some((a) => a.focused)}
      />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════
// CLI parsing & entry point
// ═══════════════════════════════════════════════════════════════

const cli = new Command()
  .name('run-agents')
  .description(
    'TUI agent pool runner — spawn opencode agents against the kanban board'
  )
  .option('-p, --project <name>', 'kanban project to pull tasks from')
  .option('-c, --count <n>', 'number of parallel agents', '2')
  .option('-a, --api <url>', 'kanban API base URL', 'http://localhost:3333')
  .option('-m, --model <model>', 'opencode model flag')
  .option('-l, --loop', 'keep the pool full indefinitely', false)
  .option(
    '-d, --delay <seconds>',
    'seconds before respawning in loop mode',
    '5'
  )
  .option('-i, --interactive', 'interactive setup prompts', false)
  .parse();

const opts = cli.opts();

// ── Interactive setup ────────────────────────────────────────

async function interactiveSetup(): Promise<Config> {
  console.log('\n  Agent Pool — Interactive Setup\n');

  const project = await input({
    message: 'Project (leave empty for any):',
    default: '',
  });

  const countStr = await input({
    message: 'Number of agents:',
    default: '2',
  });

  const api = await input({
    message: 'API base URL:',
    default: 'http://localhost:3333',
  });

  const model = await input({
    message: 'Model (optional, leave empty to skip):',
    default: '',
  });

  const loop = await confirm({
    message: 'Loop mode (keep respawning agents)?',
    default: false,
  });

  let delay = 5;
  if (loop) {
    const delayStr = await input({
      message: 'Delay between respawns (seconds):',
      default: '5',
    });
    delay = parseInt(delayStr, 10) || 5;
  }

  return {
    project: project || null,
    count: Math.max(1, parseInt(countStr, 10) || 2),
    api: api.replace(/\/$/, ''),
    model: model || null,
    loop,
    delay,
  };
}

// ── Main ─────────────────────────────────────────────────────

function killAllProcs(signal: 'SIGTERM' | 'SIGKILL') {
  for (const proc of activeProcs.values()) {
    try {
      proc.kill(signal);
    } catch {}
  }
}

async function main() {
  let config: Config;

  if (opts.interactive) {
    config = await interactiveSetup();
  } else {
    config = {
      project: opts.project ?? null,
      count: Math.max(1, parseInt(opts.count, 10) || 2),
      api: opts.api.replace(/\/$/, ''),
      model: opts.model ?? null,
      loop: opts.loop,
      delay: parseInt(opts.delay, 10) || 5,
    };
  }

  // ── Enter alternate screen buffer for clean full-screen rendering ──
  enterAltScreen();

  // ── Give ink a dummy stdin so it doesn't consume our keystrokes ──
  const dummyStdin = new PassThrough() as any;
  const stdoutProxy = createStdoutProxy();
  const inkInstance = render(<App config={config} />, {
    exitOnCtrlC: false,
    stdin: dummyStdin,
    stdout: stdoutProxy as any,
    incrementalRendering: true,
  });

  // ── Process-level shutdown — completely outside React ──────
  let shutdownCount = 0;

  function triggerShutdown() {
    shutdownCount++;

    if (shutdownCount >= 2) {
      // Second attempt — force kill everything and exit NOW
      killAllProcs('SIGKILL');
      inkInstance.unmount();
      leaveAltScreen();
      process.exit(1);
    }

    if (shutdownRequested) return;
    shutdownRequested = true;

    // Graceful: SIGTERM all children
    killAllProcs('SIGTERM');

    // After 3s, escalate to SIGKILL and force exit
    setTimeout(() => {
      killAllProcs('SIGKILL');
      inkInstance.unmount();
      leaveAltScreen();
      process.exit(0);
    }, 3000);
  }

  // ── We own stdin: set raw mode and listen for keystrokes ──
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data: Buffer) => {
    const events = parseInputEvents(data);
    for (const ev of events) {
      // ── Quit ──
      if (ev.type === 'ctrl-c' || (ev.type === 'char' && ev.char === 'q')) {
        triggerShutdown();
        return;
      }

      if (shutdownRequested) continue;

      // ── Focus navigation ──
      if (ev.type === 'tab') {
        const n = moduleAgentData.length;
        focusedIndex = n > 0 ? (focusedIndex + 1) % n : -1;
        focusDirty = true;
        continue;
      }
      if (ev.type === 'shift-tab') {
        const n = moduleAgentData.length;
        focusedIndex = n > 0 ? (focusedIndex - 1 + n) % n : -1;
        focusDirty = true;
        continue;
      }
      if (ev.type === 'escape') {
        focusedIndex = -1;
        // Reset all scroll offsets to 0 (pin to bottom)
        for (const d of moduleAgentData) {
          if (d.scrollOffset > 0) {
            d.scrollOffset = 0;
            d.dirty = true;
          }
        }
        focusDirty = true;
        continue;
      }

      // ── Keyboard scroll (when focused) ──
      if (focusedIndex >= 0 && focusedIndex < moduleAgentData.length) {
        const d = moduleAgentData[focusedIndex];
        const maxOffset = Math.max(0, d.lines.length - currentLayout.maxLines);

        if (ev.type === 'up') {
          d.scrollOffset = Math.min(maxOffset, d.scrollOffset + 1);
          d.dirty = true;
          continue;
        }
        if (ev.type === 'down') {
          d.scrollOffset = Math.max(0, d.scrollOffset - 1);
          d.dirty = true;
          continue;
        }
        if (ev.type === 'page-up') {
          d.scrollOffset = Math.min(
            maxOffset,
            d.scrollOffset + currentLayout.maxLines
          );
          d.dirty = true;
          continue;
        }
        if (ev.type === 'page-down') {
          d.scrollOffset = Math.max(0, d.scrollOffset - currentLayout.maxLines);
          d.dirty = true;
          continue;
        }
        if (ev.type === 'home') {
          d.scrollOffset = maxOffset;
          d.dirty = true;
          continue;
        }
        if (ev.type === 'end') {
          d.scrollOffset = 0;
          d.dirty = true;
          continue;
        }
      }

      // ── Mouse wheel scroll ──
      if (ev.type === 'wheel-up' || ev.type === 'wheel-down') {
        // Map terminal row to panel index
        const panelIdx = Math.floor(
          (ev.row - 1 - HEADER_ROWS) / currentLayout.panelHeight
        );
        if (panelIdx >= 0 && panelIdx < moduleAgentData.length) {
          // Auto-focus the panel being scrolled
          if (focusedIndex !== panelIdx) {
            focusedIndex = panelIdx;
            focusDirty = true;
          }
          const d = moduleAgentData[panelIdx];
          const maxOffset = Math.max(
            0,
            d.lines.length - currentLayout.maxLines
          );
          const scrollAmount = 3; // lines per wheel tick
          if (ev.type === 'wheel-up') {
            d.scrollOffset = Math.min(maxOffset, d.scrollOffset + scrollAmount);
          } else {
            d.scrollOffset = Math.max(0, d.scrollOffset - scrollAmount);
          }
          d.dirty = true;
        }
        continue;
      }

      // ── Agent actions (when focused) ──
      if (
        ev.type === 'char' &&
        focusedIndex >= 0 &&
        focusedIndex < moduleAgentData.length
      ) {
        if (ev.char === 'r') {
          pendingCommands.push({ type: 'restart', index: focusedIndex });
          continue;
        }
        if (ev.char === 'x') {
          pendingCommands.push({ type: 'kill', index: focusedIndex });
          continue;
        }
      }

      // ── Pool management (always available) ──
      if (ev.type === 'char') {
        if (ev.char === 'k') {
          pendingCommands.push({ type: 'add' });
        }
        if (ev.char === 'j') {
          pendingCommands.push({ type: 'remove' });
        }
      }
    }
  });

  // ── Signal handlers — for when stdin is NOT in raw mode ───
  // (e.g. piped stdin, kill command, etc.)
  process.on('SIGINT', () => triggerShutdown());
  process.on('SIGTERM', () => triggerShutdown());

  // ── Clean up alternate screen on natural exit (auto-exit) ───
  inkInstance.waitUntilExit().then(() => {
    leaveAltScreen();
  });

  // ── Safety net: always restore terminal on process exit ───
  process.on('exit', () => leaveAltScreen());
}

main();
