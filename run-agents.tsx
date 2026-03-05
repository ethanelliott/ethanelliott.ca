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
import { PassThrough } from 'stream';

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

const MAX_BUFFER_LINES = 200;
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
  startTime: number | null;
  endTime: number | null;
  exitCode: number | null;
  logPath: string | null;
  iteration: number;
  dirty: boolean; // true when mutated since last flush
}

/** Snapshot passed to React for rendering — immutable between flushes */
interface AgentSnapshot {
  name: string;
  color: string;
  status: AgentStatus;
  lines: string[];
  startTime: number | null;
  endTime: number | null;
  exitCode: number | null;
  logPath: string | null;
  iteration: number;
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
type PoolCommand = 'add' | 'remove';
const pendingCommands: PoolCommand[] = [];

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

const Header: FC<{
  config: Config;
  agentCount: number;
  agentNames: string[];
}> = ({ config, agentCount, agentNames }) => (
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
        <Text dimColor>api: </Text>
        <Text bold>{config.api}</Text>
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
  idle: ' ',
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
  spinnerFrame: string;
}> = ({ agent, panelHeight, maxLines, spinnerFrame }) => {
  const color = STATUS_COLOR[agent.status];
  const now = Date.now();
  const duration =
    agent.startTime != null
      ? elapsed((agent.endTime ?? now) - agent.startTime)
      : '';

  const totalLines = agent.lines.length;

  // Take the last maxLines, then pad to exactly maxLines so height is stable
  const visibleLines = agent.lines.slice(-maxLines);
  while (visibleLines.length < maxLines) {
    visibleLines.push('');
  }

  // ── Scrollbar geometry ──────────────────────────────────────
  const trackHeight = maxLines;
  const canScroll = totalLines > maxLines;
  // Thumb size proportional to viewport/total, minimum 1 row
  const thumbSize = canScroll
    ? Math.max(1, Math.round(trackHeight * (maxLines / totalLines)))
    : trackHeight;
  // Viewport is always at the bottom
  const thumbTop = canScroll ? trackHeight - thumbSize : 0;

  // Build scrollbar column: thumb chars vs track chars
  const scrollbar = Array.from({ length: trackHeight }, (_, i) => {
    const isThumb = i >= thumbTop && i < thumbTop + thumbSize;
    return isThumb;
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={agent.status === 'running' ? agent.color : color}
      paddingX={1}
      height={panelHeight}
      overflow="hidden"
    >
      {/* Panel header */}
      <Box justifyContent="space-between">
        <Text>
          {agent.status === 'running' || agent.status === 'starting' ? (
            <Text color={agent.color}>{spinnerFrame} </Text>
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
          {canScroll && <Text dimColor> [{totalLines - maxLines}+]</Text>}
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
                    ? 'Waiting...'
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
  startTime: number;
  shuttingDown: boolean;
  loop: boolean;
}> = ({ stats, startTime, shuttingDown, loop }) => (
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
      <Text>{elapsed(Date.now() - startTime)}</Text>
    </Text>
    <Text dimColor>
      {shuttingDown ? (
        <Text color="yellow" bold>
          shutting down...
        </Text>
      ) : (
        <Text>
          <Text bold>q</Text> quit
          {loop && (
            <Text>
              {'  '}
              <Text bold>r</Text> restart slot
            </Text>
          )}
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
      startTime: null,
      endTime: null,
      exitCode: null,
      logPath: null,
      iteration: 0,
      dirty: true,
    }))
  );
  const statsRef = useRef({ completed: 0, failed: 0, dirty: true });
  const spinnerIndexRef = useRef(0);
  // Tracks the next slot number for unique naming (monotonically increasing)
  const nextSlotNumRef = useRef(config.count + 1);

  // ── Display state — updated only by the flush interval ─────
  const [agents, setAgents] = useState<AgentSnapshot[]>(() =>
    dataRef.current.map(({ dirty: _, ...rest }) => ({ ...rest }))
  );
  const [stats, setStats] = useState({ completed: 0, failed: 0 });
  const [spinnerFrame, setSpinnerFrame] = useState(SPINNER_FRAMES[0]);
  const [shuttingDown, setShuttingDown] = useState(false);

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
          // Mutate ref directly — no setState
          // Guard: slot may have been removed while output was buffered
          if (!dataRef.current.includes(d)) return;
          d.status = 'running';
          if (d.lines.length >= MAX_BUFFER_LINES) {
            d.lines = d.lines.slice(-(MAX_BUFFER_LINES - 1));
          }
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

          // Loop mode: respawn after delay
          if (config.loop && !shutdownRequested) {
            const idx = dataRef.current.indexOf(d);
            if (idx !== -1) {
              setTimeout(() => spawnForSlot(idx), config.delay * 1000);
            }
          }
        }
      );

      d.logPath = logPath;
      d.dirty = true;
      activeProcs.set(name, proc);
    },
    [config]
  );

  // ── Single flush interval — the ONLY source of React re-renders ──
  useEffect(() => {
    const id = setInterval(() => {
      // Advance spinner
      spinnerIndexRef.current =
        (spinnerIndexRef.current + 1) % SPINNER_FRAMES.length;
      setSpinnerFrame(SPINNER_FRAMES[spinnerIndexRef.current]);

      // Process pending add/remove commands
      let sizeChanged = false;
      while (pendingCommands.length > 0) {
        const cmd = pendingCommands.shift()!;
        if (cmd === 'add') {
          const num = nextSlotNumRef.current++;
          const newSlot: AgentData = {
            name: slotName(num),
            color: slotColor(num),
            status: 'idle',
            lines: [],
            startTime: null,
            endTime: null,
            exitCode: null,
            logPath: null,
            iteration: 0,
            dirty: true,
          };
          dataRef.current.push(newSlot);
          sizeChanged = true;
          // Spawn immediately
          spawnForSlot(dataRef.current.length - 1);
        } else if (cmd === 'remove' && dataRef.current.length > 1) {
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
        }
      }

      // Flush agent data if any slot is dirty or size changed
      let anyDirty = sizeChanged;
      for (const d of dataRef.current) {
        if (d.dirty) {
          anyDirty = true;
          break;
        }
      }
      if (anyDirty) {
        setAgents(
          dataRef.current.map((d) => {
            d.dirty = false;
            const { dirty: _, ...snapshot } = d;
            return { ...snapshot, lines: [...d.lines] };
          })
        );
      }

      // Flush stats if dirty
      if (statsRef.current.dirty) {
        statsRef.current.dirty = false;
        setStats({
          completed: statsRef.current.completed,
          failed: statsRef.current.failed,
        });
      }

      // Sync shutdown state from module-level flag
      if (shutdownRequested) {
        setShuttingDown(true);
      }
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [spawnForSlot]);

  // Spawn initial agents on mount
  useEffect(() => {
    for (let i = 0; i < config.count; i++) {
      spawnForSlot(i);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-exit when all done (single-run mode)
  useEffect(() => {
    if (
      !config.loop &&
      agents.length > 0 &&
      agents.every((a) => a.status === 'done' || a.status === 'error')
    ) {
      const timer = setTimeout(() => exit(), 2000);
      return () => clearTimeout(timer);
    }
  }, [agents, config.loop, exit]);

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
      <Header config={config} agentCount={agentCount} agentNames={agentNames} />
      <Box flexDirection="column" flexGrow={1}>
        {agents.map((agent) => (
          <AgentPanel
            key={agent.name}
            agent={agent}
            panelHeight={panelHeight}
            maxLines={maxLines}
            spinnerFrame={spinnerFrame}
          />
        ))}
      </Box>
      <Footer
        stats={stats}
        startTime={appStartTime.current}
        shuttingDown={shuttingDown}
        loop={config.loop}
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

  // ── Give ink a dummy stdin so it doesn't consume our keystrokes ──
  const dummyStdin = new PassThrough() as any;
  const inkInstance = render(<App config={config} />, {
    exitOnCtrlC: false,
    stdin: dummyStdin,
  });

  // ── Process-level shutdown — completely outside React ──────
  let shutdownCount = 0;

  function triggerShutdown() {
    shutdownCount++;

    if (shutdownCount >= 2) {
      // Second attempt — force kill everything and exit NOW
      killAllProcs('SIGKILL');
      inkInstance.unmount();
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
      process.exit(0);
    }, 3000);
  }

  // ── We own stdin: set raw mode and listen for keystrokes ──
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data: Buffer) => {
    const str = data.toString();
    for (const ch of str) {
      if (ch === 'q' || ch === '\x03') {
        triggerShutdown();
        return;
      }
      if (ch === 'k' && !shutdownRequested) {
        pendingCommands.push('add');
      }
      if (ch === 'j' && !shutdownRequested) {
        pendingCommands.push('remove');
      }
    }
  });

  // ── Signal handlers — for when stdin is NOT in raw mode ───
  // (e.g. piped stdin, kill command, etc.)
  process.on('SIGINT', () => triggerShutdown());
  process.on('SIGTERM', () => triggerShutdown());
}

main();
