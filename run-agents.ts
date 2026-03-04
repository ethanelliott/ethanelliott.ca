#!/usr/bin/env bun
/**
 * run-agents.ts
 *
 * Spin up N opencode agents that each claim a task from the kanban board,
 * do the work, open a PR, and transition to IN_REVIEW when done.
 * CHANGES_REQUESTED tasks are picked up with higher priority than TODO tasks.
 *
 * Usage:
 *   bun run-agents.ts [--project MY_PROJECT] [--count 3] [--loop] [--delay 10]
 *
 * Options:
 *   --project   Kanban project to pull tasks from (omit to claim from any project)
 *   --count     Number of parallel agents to run  (default: 2)
 *   --api       Kanban API base URL               (default: http://localhost:3333)
 *   --model     opencode model flag               (default: omitted)
 *   --loop      Keep the pool full indefinitely — as soon as one agent finishes
 *               a replacement is spawned after --delay seconds (Ctrl-C to stop)
 *   --delay     Seconds to wait before spawning a replacement agent (default: 5)
 */

import { parseArgs } from 'util';
import { resolve } from 'path';
import { mkdirSync, createWriteStream } from 'fs';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    project: { type: 'string' },
    count: { type: 'string', default: '2' },
    api: { type: 'string', default: 'http://localhost:3333' },
    model: { type: 'string' },
    loop: { type: 'boolean', default: false },
    delay: { type: 'string', default: '5' },
  },
  strict: true,
});

const PROJECT = values.project ?? null;
const COUNT = parseInt(values.count!, 10);
const API = values.api!.replace(/\/$/, '');
const MODEL_FLAG = values.model ? ['--model', values.model] : [];
const LOOP = values.loop ?? false;
const DELAY_MS = parseInt(values.delay!, 10) * 1000;

if (isNaN(COUNT) || COUNT < 1) {
  console.error('ERROR: --count must be a positive integer');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Agent names — each pool slot gets a persistent name derived from its index
// ---------------------------------------------------------------------------
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

function slotName(slotIndex: number): string {
  return AGENT_NAMES[(slotIndex - 1) % AGENT_NAMES.length];
}

// ---------------------------------------------------------------------------
// Log directory
// ---------------------------------------------------------------------------
const LOG_DIR = resolve(import.meta.dir, '.agent-logs');
mkdirSync(LOG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Per-agent prompt
// ---------------------------------------------------------------------------
function buildPrompt(agentId: string): string {
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
  WORKTREE_BASE="$(dirname "$REPO_ROOT")/${REPO_NAME}.worktrees"
  mkdir -p "$WORKTREE_BASE"

  BRANCH="task/${agentId}-<task-id>"
  WORKTREE_PATH="${WORKTREE_BASE}/${agentId}-<task-id>"
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
  WORKTREE_BASE="$(dirname "$REPO_ROOT")/${REPO_NAME}.worktrees"
  BRANCH="task/<assignee from activity log>-<task-id>"
  WORKTREE_PATH="${WORKTREE_BASE}/<assignee from activity log>-<task-id>"

(Read the original assignee and branch name from the task's activity log —
the "Worktree created" comment records the exact path and branch.)

- If the worktree directory already exists: cd into it and run `git pull`.
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

// ---------------------------------------------------------------------------
// Spawn one agent
// ---------------------------------------------------------------------------
async function runAgent(name: string): Promise<void> {
  const logPath = `${LOG_DIR}/${name}-${Date.now()}.log`;
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const prompt = buildPrompt(name);

  console.log(`[${name}] starting  → log: ${logPath}`);

  const proc = Bun.spawn(['opencode', 'run', ...MODEL_FLAG, prompt], {
    cwd: import.meta.dir,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });

  // Stream stdout + stderr to per-agent log file and our console
  const prefix = `[${name}] `;

  async function streamToLog(
    reader: ReadableStream<Uint8Array>,
    label: string
  ) {
    const decoder = new TextDecoder();
    for await (const chunk of reader) {
      const text = decoder.decode(chunk);
      logStream.write(text);
      for (const line of text.split('\n')) {
        if (line.trim()) process.stdout.write(`${prefix}${label}${line}\n`);
      }
    }
  }

  await Promise.all([
    streamToLog(proc.stdout, ''),
    streamToLog(proc.stderr, '[err] '),
  ]);

  const exitCode = await proc.exited;
  logStream.end();

  if (exitCode === 0) {
    console.log(`[${name}] ✓ done (exit 0)`);
  } else {
    console.error(`[${name}] ✗ exited with code ${exitCode}`);
  }
}

// ---------------------------------------------------------------------------
// Main — pool model: always keep COUNT agents running
// ---------------------------------------------------------------------------
console.log(
  `Starting ${COUNT} agent(s)${
    PROJECT ? ` for project "${PROJECT}"` : ' across all projects'
  } against ${API}${LOOP ? ' [pool mode — loop]' : ''}`
);
console.log(`Logs: ${LOG_DIR}/\n`);

const slotNames = Array.from({ length: COUNT }, (_, i) => slotName(i + 1));
console.log(`Agent names: ${slotNames.join(', ')}\n`);

// Graceful shutdown on Ctrl-C
process.on('SIGINT', () => {
  console.log('\nInterrupted — waiting for active agents to finish.');
  process.exit(0);
});

if (!LOOP) {
  // Non-loop: run exactly COUNT agents and wait for all to finish.
  const results = await Promise.allSettled(
    slotNames.map((name) => runAgent(name))
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  console.log(
    `\nAll agents finished. ${COUNT - failed}/${COUNT} completed cleanly.`
  );
  if (failed > 0) process.exit(1);
} else {
  // Pool mode: each slot has a fixed name and self-perpetuates indefinitely.
  async function slot(name: string): Promise<void> {
    while (true) {
      try {
        await runAgent(name);
      } catch {
        // keep the slot alive even on unexpected errors
      }
      console.log(`[${name}] back in ${DELAY_MS / 1000}s — Ctrl-C to stop.`);
      await Bun.sleep(DELAY_MS);
    }
  }

  // Start COUNT independent slots — they run forever until interrupted.
  await Promise.all(slotNames.map((name) => slot(name)));
}
