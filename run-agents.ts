#!/usr/bin/env bun
/**
 * run-agents.ts
 *
 * Spin up N opencode agents that each claim a task from the kanban board,
 * do the work, and transition to IN_REVIEW when done.
 *
 * Usage:
 *   bun run-agents.ts --project MY_PROJECT [--count 3] [--api http://localhost:3333]
 *
 * Options:
 *   --project   Kanban project name to pull tasks from  (required)
 *   --count     Number of parallel agents to run        (default: 2)
 *   --api       Kanban API base URL                     (default: http://localhost:3333)
 *   --model     opencode model to pass to each agent    (default: omitted; uses opencode default)
 */

import { parseArgs } from "util";
import { resolve } from "path";
import { mkdirSync, createWriteStream } from "fs";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    project: { type: "string" },
    count: { type: "string", default: "2" },
    api: { type: "string", default: "http://localhost:3333" },
    model: { type: "string" },
  },
  strict: true,
});

const PROJECT = values.project;
const COUNT = parseInt(values.count!, 10);
const API = values.api!.replace(/\/$/, "");
const MODEL_FLAG = values.model ? ["--model", values.model] : [];

if (!PROJECT) {
  console.error("ERROR: --project is required");
  process.exit(1);
}

if (isNaN(COUNT) || COUNT < 1) {
  console.error("ERROR: --count must be a positive integer");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Log directory
// ---------------------------------------------------------------------------
const LOG_DIR = resolve(import.meta.dir, ".agent-logs");
mkdirSync(LOG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Per-agent prompt
// ---------------------------------------------------------------------------
function buildPrompt(agentId: string): string {
  return `
You are an autonomous coding agent named "${agentId}" working on project "${PROJECT}".
Your job is to complete exactly ONE task from the kanban board, then stop.

## Step 1 — Claim a task

Make this API call to atomically claim the next available task:

  POST ${API}/tasks/next
  Content-Type: application/json
  { "assignee": "${agentId}", "project": "${PROJECT}" }

- If the response is 404, there are no eligible tasks. Log "No tasks available" and stop immediately.
- If the response is 409, you already have a task in progress. That should not happen on a fresh run.
- On success (200) you will receive the full task object. It is already IN_PROGRESS and assigned to you.

## Step 2 — Read the task

Read the task's title and description carefully. That is your complete specification.
The task ID is in the response as "id".

## Step 3 — Do the work

Implement the task. Follow all existing code conventions in the repository.
Run builds and tests to verify your changes compile and pass.
Commit your changes with a conventional commit message referencing the task title.

## Step 4 — Post an activity note

When your work is complete, post a summary:

  POST ${API}/tasks/<task-id>/activity
  Content-Type: application/json
  { "type": "comment", "author": "${agentId}", "content": "<summary of what you did and the commit SHA>" }

## Step 5 — Transition to IN_REVIEW

  PATCH ${API}/tasks/<task-id>/transition
  Content-Type: application/json
  { "state": "IN_REVIEW" }

## Step 6 — Stop

Your work is done. Do not claim another task. Exit cleanly.

If at any point you are blocked or the task is ambiguous, transition the task to BLOCKED instead:

  PATCH ${API}/tasks/<task-id>/transition
  Content-Type: application/json
  { "state": "BLOCKED" }

And post an activity note explaining why.
`.trim();
}

// ---------------------------------------------------------------------------
// Spawn one agent
// ---------------------------------------------------------------------------
async function runAgent(index: number): Promise<void> {
  const agentId = `agent-${index}`;
  const logPath = `${LOG_DIR}/${agentId}-${Date.now()}.log`;
  const logStream = createWriteStream(logPath, { flags: "a" });

  const prompt = buildPrompt(agentId);

  console.log(`[${agentId}] starting  → log: ${logPath}`);

  const proc = Bun.spawn(["opencode", "run", ...MODEL_FLAG, prompt], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  // Stream stdout + stderr to per-agent log file and our console
  const prefix = `[${agentId}] `;

  async function streamToLog(
    reader: ReadableStream<Uint8Array>,
    label: string
  ) {
    const decoder = new TextDecoder();
    for await (const chunk of reader) {
      const text = decoder.decode(chunk);
      logStream.write(text);
      for (const line of text.split("\n")) {
        if (line.trim()) process.stdout.write(`${prefix}${label}${line}\n`);
      }
    }
  }

  await Promise.all([
    streamToLog(proc.stdout, ""),
    streamToLog(proc.stderr, "[err] "),
  ]);

  const exitCode = await proc.exited;
  logStream.end();

  if (exitCode === 0) {
    console.log(`[${agentId}] ✓ done (exit 0)`);
  } else {
    console.error(`[${agentId}] ✗ exited with code ${exitCode}`);
  }
}

// ---------------------------------------------------------------------------
// Main — launch all agents in parallel
// ---------------------------------------------------------------------------
console.log(
  `Starting ${COUNT} agent(s) for project "${PROJECT}" against ${API}`
);
console.log(`Logs: ${LOG_DIR}/\n`);

const agents = Array.from({ length: COUNT }, (_, i) => runAgent(i + 1));

// Graceful shutdown on Ctrl-C
process.on("SIGINT", () => {
  console.log("\nInterrupted — agents will finish their current operation.");
  process.exit(0);
});

const results = await Promise.allSettled(agents);

const failed = results.filter((r) => r.status === "rejected").length;
console.log(
  `\nAll agents finished. ${COUNT - failed}/${COUNT} completed cleanly.`
);
if (failed > 0) process.exit(1);
