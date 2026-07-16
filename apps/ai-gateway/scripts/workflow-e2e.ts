/**
 * Workflow engine end-to-end test.
 *
 * Boots the real gateway Application against an in-memory Postgres (pg-mem)
 * and exercises the full workflow API: palette, validation, branching,
 * templating, retries, failure handling, and CRUD edges.
 *
 * Run from the repo root (esbuild applies the legacy-decorator tsconfig —
 * running the TS directly with bun fails on TypeORM decorators):
 *
 *   bunx esbuild apps/ai-gateway/scripts/workflow-e2e.ts --bundle \
 *     --packages=external --platform=node --format=esm \
 *     --outfile=dist/workflow-e2e.mjs --tsconfig=apps/ai-gateway/tsconfig.app.json
 *   node dist/workflow-e2e.mjs
 */
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'crypto';

import { WORKFLOW_ENTITIES, initializeWorkflowDb, getWorkflowRepos } from '../src/app/workflows/db';
import { Application } from '../src/app/app';
import { WorkflowScheduler, getWorkflowScheduler } from '../src/app/workflows/scheduler';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 300) : '');
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── in-memory postgres ──────────────────────────────────────────────
const db = newDb();
db.public.registerFunction({
  name: 'version',
  returns: DataType.text,
  implementation: () => 'PostgreSQL 16.0 (pg-mem)',
});
db.public.registerFunction({
  name: 'current_database',
  returns: DataType.text,
  implementation: () => 'ai_gateway',
});
db.registerExtension('uuid-ossp', (schema) => {
  schema.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    implementation: randomUUID,
    impure: true,
  });
});

const ds: any = await db.adapters.createTypeormDataSource({
  type: 'postgres',
  entities: WORKFLOW_ENTITIES,
  synchronize: true,
});
const ok = await initializeWorkflowDb(ds);
check('pg-mem DataSource initialized', ok);

// ── boot the real application ───────────────────────────────────────
const app = Fastify({ logger: false });
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
await app.register(Application);
await app.ready();

const api = async (method: any, url: string, body?: unknown) => {
  const res = await app.inject({ method, url, payload: body as any });
  return { status: res.statusCode, body: res.json() };
};

// ── 1. step-types palette ───────────────────────────────────────────
console.log('\n── step types');
{
  const { status, body } = await api('GET', '/workflows/step-types');
  check('palette returns 200', status === 200);
  const kinds = body.stepTypes.map((s: any) => s.kind).sort();
  check(
    'six core kinds registered',
    JSON.stringify(kinds) ===
      JSON.stringify(['condition', 'llm_prompt', 'manual_trigger', 'notify', 'tool_call', 'transform']),
    kinds
  );
  check('trigger flagged', body.stepTypes.find((s: any) => s.kind === 'manual_trigger')?.isTrigger === true);
}

// ── 2. validation ───────────────────────────────────────────────────
console.log('\n── graph validation');
{
  // unknown kind
  let r = await api('POST', '/workflows/validate', {
    graph: { nodes: [{ id: 'a', kind: 'nope', config: {} }], edges: [] },
  });
  check('unknown kind rejected', r.body.valid === false);

  // no trigger
  r = await api('POST', '/workflows/validate', {
    graph: { nodes: [{ id: 'a', kind: 'transform', config: { output: {} } }], edges: [] },
  });
  check('missing trigger rejected', r.body.valid === false);

  // cycle
  r = await api('POST', '/workflows/validate', {
    graph: {
      nodes: [
        { id: 't', kind: 'manual_trigger', config: {} },
        { id: 'a', kind: 'transform', config: { output: {} } },
        { id: 'b', kind: 'transform', config: { output: {} } },
      ],
      edges: [
        { id: 'e1', from: 't', to: 'a' },
        { id: 'e2', from: 'a', to: 'b' },
        { id: 'e3', from: 'b', to: 'a' },
      ],
    },
  });
  check('cycle rejected', r.body.valid === false, r.body.errors);

  // approval-required tool
  r = await api('POST', '/workflows/validate', {
    graph: {
      nodes: [
        { id: 't', kind: 'manual_trigger', config: {} },
        { id: 'ask', kind: 'tool_call', config: { tool: 'ask_user', params: {} } },
      ],
      edges: [{ id: 'e1', from: 't', to: 'ask' }],
    },
  });
  check('approval-required tool rejected', r.body.valid === false, r.body.errors);
}

// ── 3. create + run a branching workflow ────────────────────────────
console.log('\n── branching workflow');
const graph = {
  nodes: [
    { id: 'trigger', kind: 'manual_trigger', config: {} },
    {
      id: 'calc',
      kind: 'tool_call',
      config: { tool: 'calculate', params: { expression: '({{input.a}} + {{input.b}}) * 2' } },
    },
    {
      id: 'check',
      kind: 'condition',
      config: { left: '{{nodes.calc.result}}', operator: 'greater_than', right: '100' },
    },
    {
      id: 'big',
      kind: 'transform',
      config: { output: { message: 'Big: {{nodes.calc.result}}', raw: '{{nodes.calc}}' } },
    },
    { id: 'small', kind: 'tool_call', config: { tool: 'generate_uuid', params: {} } },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'calc' },
    { id: 'e2', from: 'calc', to: 'check' },
    { id: 'e3', from: 'check', to: 'big', condition: 'true' },
    { id: 'e4', from: 'check', to: 'small', condition: 'false' },
  ],
};

let workflowId: string;
{
  const r = await api('POST', '/workflows', { name: 'Branch test', graph });
  check('workflow created', r.status === 201, r.body);
  workflowId = r.body.workflow.id;
}

async function runAndWait(input: unknown) {
  const r = await api('POST', `/workflows/${workflowId}/run`, { input });
  if (r.status !== 202) return { run: null as any, start: r };
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const detail = await api('GET', `/workflows/runs/${r.body.runId}`);
    if (detail.body.status !== 'running') return { run: detail.body, start: r };
  }
  return { run: null as any, start: r };
}

{
  // true branch
  const { run } = await runAndWait({ a: 60, b: 10 });
  check('run 1 succeeded', run?.status === 'succeeded', run?.error);
  const stepIds = run.steps.map((s: any) => s.nodeId);
  check('true branch executed (no small)', stepIds.includes('big') && !stepIds.includes('small'), stepIds);
  check('templated tool math correct', run.output?.calc?.result === 140, run.output?.calc);
  check('string interpolation works', run.output?.big?.message === 'Big: 140', run.output?.big);
  check('exact template keeps raw object', run.output?.big?.raw?.result === 140, run.output?.big?.raw);
  check('step logs have io + duration', run.steps.every((s: any) => s.status === 'succeeded' && s.durationMs !== null));
}

{
  // false branch
  const { run } = await runAndWait({ a: 1, b: 2 });
  check('run 2 succeeded', run?.status === 'succeeded', run?.error);
  const stepIds = run.steps.map((s: any) => s.nodeId);
  check('false branch executed (no big)', stepIds.includes('small') && !stepIds.includes('big'), stepIds);
  check('uuid produced', typeof run.output?.small?.uuid === 'string' || typeof run.output?.small === 'object');
}

// ── 4. failing workflow with retries ────────────────────────────────
console.log('\n── failure + retries');
{
  const r = await api('POST', '/workflows', {
    name: 'Failure test',
    graph: {
      nodes: [
        { id: 't', kind: 'manual_trigger', config: {} },
        {
          id: 'bad',
          kind: 'tool_call',
          retries: 1,
          config: { tool: 'calculate', params: { expression: 'this is not math' } },
        },
        { id: 'after', kind: 'transform', config: { output: { x: 1 } } },
      ],
      edges: [
        { id: 'e1', from: 't', to: 'bad' },
        { id: 'e2', from: 'bad', to: 'after' },
      ],
    },
  });
  const wfId = r.body.workflow.id;
  const start = await api('POST', `/workflows/${wfId}/run`, {});
  let run: any = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const d = await api('GET', `/workflows/runs/${start.body.runId}`);
    if (d.body.status !== 'running') { run = d.body; break; }
  }
  check('run failed', run?.status === 'failed', run?.status);
  const badStep = run.steps.find((s: any) => s.nodeId === 'bad');
  check('failing step recorded with 2 attempts', badStep?.attempts === 2, badStep?.attempts);
  check('downstream step never ran', !run.steps.some((s: any) => s.nodeId === 'after'));
  check('run error names the step', String(run.error).includes('bad'), run.error);
}

// ── 5. api edges ────────────────────────────────────────────────────
console.log('\n── api edges');
{
  const list = await api('GET', '/workflows');
  check('list shows workflows with lastRun', list.body.count === 2 && list.body.workflows[0].lastRun !== null);

  const disabled = await api('PUT', `/workflows/${workflowId}`, { enabled: false });
  check('disable works', disabled.body.workflow.enabled === false);
  const blocked = await api('POST', `/workflows/${workflowId}/run`, {});
  check('disabled workflow refuses to run (409)', blocked.status === 409);

  const cancel404 = await api('POST', `/workflows/runs/${randomUUID()}/cancel`);
  check('cancel unknown run → 404', cancel404.status === 404);

  const del = await api('DELETE', `/workflows/${workflowId}`);
  check('delete works', del.body.success === true);
  const gone = await api('GET', `/workflows/${workflowId}`);
  check('deleted workflow 404s', gone.status === 404);
}

// ── 6. cron scheduler ───────────────────────────────────────────────
console.log('\n── cron scheduler');
{
  // The Application boot started the singleton scheduler — stop it so
  // ticks below are deterministic
  getWorkflowScheduler().stop();

  // invalid cron rejected by schema
  const bad = await api('POST', '/workflows', {
    name: 'Bad cron',
    cron: 'not a cron',
    graph: { nodes: [{ id: 't', kind: 'manual_trigger', config: {} }], edges: [] },
  });
  check('invalid cron rejected', bad.status === 400, bad.status);

  // valid cron computes a future nextRunAt
  const created = await api('POST', '/workflows', {
    name: 'Scheduled test',
    cron: '0 8 * * *',
    graph: {
      nodes: [
        { id: 't', kind: 'manual_trigger', config: {} },
        { id: 'calc', kind: 'tool_call', config: { tool: 'calculate', params: { expression: '1 + 1' } } },
      ],
      edges: [{ id: 'e1', from: 't', to: 'calc' }],
    },
  });
  const wfId = created.body.workflow.id;
  check('cron workflow created with future nextRunAt',
    created.status === 201 && new Date(created.body.workflow.nextRunAt) > new Date(),
    created.body.workflow.nextRunAt);

  // Force the schedule into the past and drive two "replicas" concurrently:
  // exactly one must claim the firing
  const { workflows } = getWorkflowRepos();
  await workflows.update({ id: wfId }, { nextRunAt: new Date(Date.now() - 60000) });
  const replicaA = new WorkflowScheduler();
  const replicaB = new WorkflowScheduler();
  const [startedA, startedB] = await Promise.all([replicaA.tick(), replicaB.tick()]);
  const totalStarted = startedA.length + startedB.length;
  check('exactly one replica claims the firing', totalStarted === 1, { startedA, startedB });

  // wait for the run to finish and confirm it was a cron run
  let cronRun: any = null;
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const list = await api('GET', `/workflows/${wfId}/runs`);
    cronRun = list.body.runs[0];
    if (cronRun && cronRun.status !== 'running') break;
  }
  check('cron run succeeded', cronRun?.status === 'succeeded', cronRun);
  check('run recorded with cron trigger', cronRun?.trigger === 'cron', cronRun?.trigger);

  // nextRunAt advanced into the future — an immediate re-tick fires nothing
  const wfAfter = await api('GET', `/workflows/${wfId}`);
  check('nextRunAt advanced to future', new Date(wfAfter.body.nextRunAt) > new Date(), wfAfter.body.nextRunAt);
  const again = await replicaA.tick();
  check('re-tick fires nothing', again.length === 0, again);

  // disabling clears the schedule
  const disabled = await api('PUT', `/workflows/${wfId}`, { enabled: false });
  check('disable clears nextRunAt', disabled.body.workflow.nextRunAt === null, disabled.body.workflow.nextRunAt);
}

console.log(`\n═══ ${passed} passed, ${failed} failed`);
await app.close();
process.exit(failed > 0 ? 1 : 0);
