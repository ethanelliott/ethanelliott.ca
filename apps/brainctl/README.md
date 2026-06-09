# brainctl

A TypeScript/Fastify REST service that provides a persistent cognitive memory layer for AI agents. brainctl is a ground-up rewrite of the [original Python brainctl MCP server](https://github.com/TSchonleber/brainctl), surfacing all MCP tools as plain HTTP endpoints instead — no MCP protocol required.

---

## What is brainctl?

AI agents are stateless by default. Each new context window starts cold. brainctl solves this by giving agents a persistent, queryable brain:

- **Memories** stored with confidence scores, temporal decay, and semantic embeddings
- **Knowledge graph** linking memories, entities, and events with typed, weighted edges
- **Consolidation engine** that periodically prunes, promotes, and compresses memories — analogous to biological sleep consolidation
- **Grounded reasoning** endpoints that retrieve supporting evidence before calling an LLM
- **Multi-agent support** with per-agent isolation, cross-agent memory sharing, and Theory of Mind modeling
- **Cognitive subsystems** for beliefs, trust, reflections, workspace, tasks, and policies

All state lives in a single SQLite database (via `better-sqlite3`). FTS5 full-text search and optional `sqlite-vec` vector search run in the same process — no external search infra required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Fastify (port 3100)                   │
│         fastify-type-provider-zod · @ee/starter          │
├──────────────┬──────────────┬──────────────┬────────────┤
│   Memory &   │  Knowledge   │  Reasoning & │  Agent &   │
│  Lifecycle   │    Graph     │ Consolidation│ Subsystems │
├──────────────┴──────────────┴──────────────┴────────────┤
│                  Service Layer (23 modules)              │
├─────────────────────────────────────────────────────────┤
│   better-sqlite3  ·  FTS5  ·  sqlite-vec (optional)     │
│              WAL mode · 10s busy timeout                 │
├──────────────────────────┬──────────────────────────────┤
│  LiteLLM Proxy (chat)    │  LiteLLM Proxy (embeddings)  │
│  LITELLM_CHAT_MODEL      │  LITELLM_EMBEDDING_MODEL     │
└──────────────────────────┴──────────────────────────────┘
```

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| Single SQLite file | No external dependencies; backup is a single file copy |
| FTS5 + sqlite-vec via RRF | Hybrid search without a vector DB: keyword precision + semantic recall, merged via Reciprocal Rank Fusion (K=60) |
| LiteLLM proxy | Swap any self-hosted or cloud model by changing env vars; no code changes |
| Per-agent `agent_id` | All tables carry `agent_id`; default value is `'default'`; enables true multi-tenancy |
| Lazy table creation | Subsystem tables are created on first write so a fresh DB starts minimal |
| Safe migrations | `ALTER TABLE … ADD COLUMN` wrapped in try/catch because SQLite has no `IF NOT EXISTS` column syntax |

---

## Brain Concepts → LLM Concepts

brainctl's data model is a deliberate mapping of cognitive neuroscience onto the constraints of a stateless LLM. Understanding the analogy makes the API much easier to reason about.

### Memory systems

Human memory is not a single store. Cognitive science distinguishes several systems with different properties — and each one maps directly to a brainctl concept.

| Cognitive concept | brainctl implementation | What it means in practice |
|---|---|---|
| **Episodic memory** | `memory_type: episodic` | First-person experience records: *"I deployed the service at 14:00 and it failed"*. Tied to a specific moment. Subject to stronger decay. |
| **Semantic memory** | `memory_type: semantic` | Generalised facts distilled from experience: *"This service requires a warm-up call before traffic"*. Longer-lived. Promoted from episodic during consolidation. |
| **Procedural memory** | `memory_type: procedural` + `procedures` table | How-to knowledge encoded as reusable steps. Not forgotten easily; updated by feedback scores. |
| **Working memory** | `workspace` items + the agent's context window | The short-lived scratchpad for in-progress reasoning. Explicitly ephemeral. |
| **Prospective memory** | `triggers` table | *"Remember to do X when Y happens."* Conditions checked against incoming inputs before reasoning begins. |
| **Semantic network** | `knowledge_edges` + `entities` | The web of associations between concepts, people, and facts. Traversed via spreading activation. |

### Forgetting and reinforcement

The brain does not keep everything. brainctl models this with two mechanisms:

**Temporal decay.** Every memory carries a `temporal_class` that sets a decay half-life:

| Class | Half-life | Typical use |
|---|---|---|
| `ephemeral` | 3.5 days | Transient observations, one-off facts |
| `short` | 10 days | Session context, project-specific details |
| `medium` | 23 days | General patterns, recurring decisions |
| `long` | 69 days | Deep conventions, architectural truths |

The consolidation engine applies `confidence(t) = confidence(0) × e^(−λt)` where `λ = ln2 / half_life`. This directly mirrors the [Ebbinghaus forgetting curve](https://en.wikipedia.org/wiki/Forgetting_curve). Memories recalled frequently are protected from decay (`recalled_count` increments on every `GET /memories/:id`), just as spaced repetition delays forgetting.

**Hebbian reinforcement.** Edges between co-active memories grow stronger over consolidation cycles: *"neurons that fire together, wire together"*. Edges connecting high-confidence nodes (≥ 0.6) are boosted; edges between decayed nodes are pruned. This means the knowledge graph self-organises around what the agent actually uses.

### Consolidation as sleep

Biological sleep does not merely rest the brain — it actively reorganises memory. Slow-wave sleep replays experiences; REM sleep integrates them into semantic structures. brainctl's consolidation engine mirrors this with six sequential passes:

1. **Decay** → the forgetting pass. Low-confidence memories are soft-retired.
2. **Promote** → the integration pass. Episodic memories replayed often enough become semantic.
3. **Compress** → the deduplication pass. Near-duplicate memories (vec distance ≤ 0.18 or Jaccard ≥ 0.4) are merged into a single summary — analogous to gist extraction during REM.
4. **Hebbian** → the reinforcement pass. Active edge paths are strengthened; dormant ones decay.
5. **Gap scan** → the integrity pass. Orphaned records and broken edges are flagged.
6. **Entity tiers** → the salience pass. Highly connected entities are promoted to tier 3, making them more likely to surface in PageRank and spreading-activation queries.

This is designed to run overnight (e.g. `BRAIN_CONSOLIDATION_CRON=0 3 * * *`) so the agent starts each day with a leaner, better-organised store.

### Attention and salience

The brain prioritises what to surface through attention. brainctl approximates this with three mechanisms:

- **`importance` score** (0–1): set at write time; influences search ranking.
- **PageRank** over `knowledge_edges`: records connected to many other important records score higher. Computed on-demand via `GET /graph/pagerank`.
- **RRF search**: the combined FTS5 + vector search score ensures both keyword relevance (attention to the query) and semantic similarity (conceptual closeness) are weighted.

### Affect

The affect system tracks Valence (pleasant/unpleasant), Arousal (activated/calm), and Dominance (in control/controlled) — the standard [VAD model](https://en.wikipedia.org/wiki/Valence%E2%80%93arousal%E2%80%93dominance_model) used in affective computing. For an LLM agent, affect state acts as a metadata channel: it lets an orchestrator detect when an agent is in a "distressed" or "overloaded" state (low valence + high arousal) and adjust its behaviour — slow down, request human review, or switch to a safer default policy.

### Theory of Mind

ToM is the ability to model what *another* agent believes, desires, or intends. brainctl implements this by: (1) searching the subject agent's memory store, (2) passing that context to an LLM that extracts an estimated belief/intention model, and (3) storing the snapshot so the observer can consult it later. This is useful in multi-agent pipelines where one orchestrator needs to predict the behaviour of a sub-agent before delegating a task.

---

## Integrating with an AI Harness

brainctl is protocol-agnostic. It speaks plain HTTP/JSON, so it can be wired into any agent framework — Claude Code via MCP, LangChain, AutoGen, a bare `fetch` loop, or a custom orchestrator. The core integration model is always the same: **brainctl wraps the agent's context window by enriching inputs before the LLM call and capturing outputs after it.**

### The session lifecycle

A well-integrated agent follows a three-phase loop every session:

```
┌──────────────────────────────────────────────────────┐
│  1. ORIENT  (session start)                          │
│     GET /session/orient?agent_id=my-agent            │
│     → injects: recent events, last handoff,          │
│       active triggers, active procedures             │
│     → append this block to the system prompt         │
├──────────────────────────────────────────────────────┤
│  2. ACT  (during session — for each significant      │
│     observation, decision, or outcome)               │
│     POST /memories  ← store durable knowledge        │
│     POST /events    ← log what happened              │
│     GET  /triggers/check?q=<user input>              │
│     GET  /memories/search?q=<topic>  ← before        │
│          calling the LLM on a new topic              │
│     POST /decisions  ← record major choices          │
│     POST /reflexion  ← reflect on failures           │
├──────────────────────────────────────────────────────┤
│  3. WRAP UP  (session end)                           │
│     POST /session/wrap-up                            │
│     → creates handoff + event log entry              │
│     → next session's orient will surface this        │
└──────────────────────────────────────────────────────┘
```

### Pattern 1: System prompt injection

The simplest integration. Before every LLM call, fetch relevant memory and prepend it to the system prompt. No tool use required — works with any model.

```typescript
async function buildSystemPrompt(agentId: string, userMessage: string): Promise<string> {
  const base = process.env.BRAINCTL_URL;

  // Fetch memories relevant to the current user message
  const [memories, triggers, handoff] = await Promise.all([
    fetch(`${base}/memories/search?q=${encodeURIComponent(userMessage)}&limit=5&agent_id=${agentId}`)
      .then(r => r.json()),
    fetch(`${base}/triggers/check?q=${encodeURIComponent(userMessage)}&agent_id=${agentId}`)
      .then(r => r.json()),
    fetch(`${base}/session/handoff/latest?agent_id=${agentId}`)
      .then(r => r.ok ? r.json() : null),
  ]);

  const sections: string[] = ['You are a helpful assistant with persistent memory.'];

  if (handoff) {
    sections.push(`## Continuing from last session\n${handoff.current_state}\nOpen: ${handoff.open_loops}\nNext: ${handoff.next_step}`);
  }
  if (memories.length) {
    sections.push(`## Relevant memories\n${memories.map((m: any) => `- ${m.content}`).join('\n')}`);
  }
  if (triggers.length) {
    sections.push(`## Active triggers\n${triggers.map((t: any) => `- ${t.action}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
```

### Pattern 2: Tool use (function calling)

Expose brainctl endpoints as LLM tools. The model decides when to store or retrieve memories as part of its reasoning chain. This gives the agent more control and produces richer retrieval because the model writes its own memory queries.

```typescript
const brainctlTools = [
  {
    name: 'remember',
    description: 'Store a memory for future sessions. Use for durable facts, decisions, and lessons.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        memory_type: { enum: ['episodic', 'semantic', 'procedural'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        temporal_class: { enum: ['ephemeral', 'short', 'medium', 'long'] },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall',
    description: 'Search memories by semantic similarity and keyword.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
  },
  {
    name: 'think',
    description: 'Follow associations from a concept through the knowledge graph.',
    parameters: {
      type: 'object',
      properties: { seed: { type: 'string' }, depth: { type: 'number' } },
      required: ['seed'],
    },
  },
];

// Tool call handler
async function handleToolCall(name: string, args: Record<string, unknown>, agentId: string) {
  const base = process.env.BRAINCTL_URL;
  if (name === 'remember') {
    return fetch(`${base}/memories`, {
      method: 'POST',
      body: JSON.stringify({ ...args, agent_id: agentId }),
    }).then(r => r.json());
  }
  if (name === 'recall') {
    return fetch(`${base}/memories/search?q=${encodeURIComponent(args.query as string)}&limit=${args.limit ?? 5}&agent_id=${agentId}`)
      .then(r => r.json());
  }
  if (name === 'think') {
    return fetch(`${base}/think?q=${encodeURIComponent(args.seed as string)}&depth=${args.depth ?? 2}&agent_id=${agentId}`)
      .then(r => r.json());
  }
}
```

### Pattern 3: MCP wrapper

brainctl is itself a REST service, not an MCP server. But because it is just HTTP, it is straightforward to wrap it in an MCP server layer using the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Each brainctl endpoint becomes an MCP tool. The original Python brainctl used this pattern natively; the REST rewrite makes it framework-agnostic while preserving the option to re-wrap with MCP if needed.

```typescript
// Minimal MCP wrapper sketch
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({ name: 'brainctl', version: '1.0.0' }, { capabilities: { tools: {} } });
const BASE = process.env.BRAINCTL_URL ?? 'http://localhost:3100';

server.setRequestHandler('tools/call', async ({ params }) => {
  const { name, arguments: args } = params;
  // Route tool name → brainctl HTTP call
  if (name === 'add_memory') {
    const res = await fetch(`${BASE}/memories`, { method: 'POST', body: JSON.stringify(args) });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
  }
  // ... etc for each tool
});
```

### Pattern 4: Middleware / event hooks

In agent frameworks that support middleware (e.g. hooks around LLM calls), brainctl fits cleanly as a pre/post interceptor:

```
before_llm_call:
  → GET /session/orient         (first call of session only)
  → GET /triggers/check?q=<input>
  → GET /memories/search?q=<input>
  → GET /affect/state           (detect emotional distress signals)
  → inject all above into system prompt

after_llm_call:
  → POST /events                (log what happened)
  → POST /memories              (if the model output contains durable knowledge)
  → POST /decisions             (if a decision was made)
  → POST /affect                (classify the input/output tone)

on_session_end:
  → POST /session/wrap-up
```

### Multi-agent wiring

When multiple agents share a brainctl instance, each uses its own `agent_id`. Shared knowledge flows through two mechanisms:

- **`POST /agents/:id/share`** — explicitly copies a subset of memories from agent A to agent B (filtered by query or category).
- **Theory of Mind** — agent A can call `POST /tom/model` to build a model of what agent B currently believes, without reading B's memories directly.

This separation-with-sharing mirrors how human teams work: private working memory, selective communication, and collaborative reasoning.

### Trigger-driven reactivity

Triggers can make the agent reactive without polling:

```typescript
// Register once at startup
await fetch(`${BRAINCTL_URL}/triggers`, {
  method: 'POST',
  body: JSON.stringify({
    condition: 'user mentions production outage',
    keywords: 'outage,down,incident,p0,pager',
    action: 'Switch to incident response mode. Load the on-call runbook procedure.',
    priority: 'critical',
    agent_id: 'my-agent',
  }),
});

// Check on every user input (cheap: pure in-process keyword scan)
const fired = await fetch(
  `${BRAINCTL_URL}/triggers/check?q=${encodeURIComponent(userInput)}&agent_id=my-agent`,
).then(r => r.json());

if (fired.length) {
  systemPrompt += `\n\n## TRIGGERED\n${fired.map(t => t.action).join('\n')}`;
}
```

### Grounded reasoning vs. raw generation

The `/reason`, `/infer`, and `/dream` endpoints implement **retrieval-augmented generation (RAG)** internally. Rather than retrieving context externally and injecting it yourself, you POST a question and receive an answer with citations. Use these when you want brainctl to own the retrieval-augmentation loop; use pattern 1/2 above when you want the orchestrator to control it.

```
POST /reason
{ "query": "What do we know about the auth service failures?", "agent_id": "my-agent" }

→ 1. Searches memories + entities + events for relevant context
→ 2. Assembles a prompt with cited evidence
→ 3. Calls LiteLLM → returns answer + source_ids
```

---

## Quick Start

### Prerequisites

- **Bun** ≥ 1.0 (monorepo package manager)
- **Node** ≥ 20 (for esbuild)
- Optional: LiteLLM proxy for embeddings and LLM reasoning

### Build & run

```bash
# From the monorepo root
npx nx serve brainctl

# Or build a production bundle
npx nx build brainctl
node dist/apps/brainctl/main.js
```

### Docker

```bash
docker build -f apps/brainctl/Dockerfile -t brainctl .
docker run -p 3100:3100 \
  -e LITELLM_BASE_URL=http://my-litellm:4000 \
  -v /data/brainctl:/data \
  -e BRAIN_DB=/data/brain.db \
  brainctl
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAIN_DB` | `~/brainctl/brain.db` | SQLite database path |
| `LITELLM_BASE_URL` | _(none)_ | LiteLLM proxy base URL. Embeddings and LLM calls disabled when unset |
| `LITELLM_API_KEY` | `no-key` | Bearer token for LiteLLM proxy |
| `LITELLM_EMBEDDING_MODEL` | `text-embedding-3-small` | Model name sent in `/v1/embeddings` requests |
| `LITELLM_EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions — must match the embedding model's output |
| `LITELLM_CHAT_MODEL` | `gpt-4o-mini` | Model name for chat/reasoning requests |
| `BRAIN_CONSOLIDATION_CRON` | _(none)_ | Cron expression for automatic consolidation (e.g. `0 3 * * *` for 3 AM daily) |
| `PORT` | `3100` | HTTP listen port (overrides app.config default) |

---

## API Reference

All endpoints accept and return JSON. `agent_id` defaults to `"default"` when omitted. Swagger UI is available at `/docs` when `ENABLE_SWAGGER=true`.

---

### Core Memory

The primary storage unit. Each memory has a `confidence` score (0–1), a `memory_type` (`episodic`, `semantic`, `procedural`), and a `temporal_class` (`ephemeral`, `short`, `medium`, `long`) that controls decay half-life.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/memories` | Store a new memory | `add_memory` |
| `GET` | `/memories/search?q=` | Hybrid FTS5+vec search with RRF | `search_memories` |
| `GET` | `/memories/:id` | Retrieve memory by ID (bumps recall stats) | `get_memory` |
| `DELETE` | `/memories/:id` | Soft-retire a memory | `forget_memory` |

**POST /memories body:**
```json
{
  "content": "The deployment pipeline uses GitHub Actions",
  "category": "devops",
  "tags": ["ci", "github"],
  "confidence": 0.9,
  "memory_type": "semantic",
  "temporal_class": "long",
  "scope": "project-x",
  "agent_id": "claude-3"
}
```

---

### Memory Lifecycle

Advanced memory management: abstraction layers, conflict resolution, quarantine, and pattern detection. These have no direct MCP equivalents — they are new capabilities added in this implementation.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/memories/:id/zoom-in` | Granular episodic memories semantically close to a seed |
| `POST` | `/memories/zoom-out` | Abstract summary of a memory cluster (by IDs or query) |
| `POST` | `/memories/abstract` | Multi-level hierarchical summary at 1–5 granularity levels |
| `GET` | `/memories/retirement-candidates` | Low-confidence / low-recall memories ready for retirement |
| `POST` | `/memories/resolve-conflict` | Detect and resolve contradictions between two memories |
| `POST` | `/memories/:id/quarantine` | Isolate a memory for review without retiring it |
| `DELETE` | `/memories/:id/quarantine` | Release a memory from quarantine |
| `GET` | `/memories/quarantined` | List all quarantined memories |
| `GET` | `/memories/patterns` | Recurring themes by tag frequency + optional LLM pattern extraction |

---

### Events

Append-only observation log. Events are lighter than memories — they record *what happened* without the full retrieval/confidence infrastructure.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/events` | Log a new event | `log_event` |
| `GET` | `/events` | List events with optional type/project/pagination filters | _(new)_ |
| `GET` | `/events/:id` | Retrieve a single event by ID | _(new)_ |
| `DELETE` | `/events/:id` | Delete an event (also removes its embedding) | _(new)_ |
| `GET` | `/events/search?q=` | Hybrid event search | `search_events` |
| `GET` | `/events/recent` | Most recent N events | `get_recent_events` |

---

### Entities

Named concepts, people, projects, or systems with compiled understanding accumulated over time.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/entities` | Create or get an entity | `create_entity` |
| `GET` | `/entities/search?q=` | FTS search across entity name, observations, compiled truth | `search_entities` |
| `GET` | `/entities/:name` | Retrieve entity with full properties | `get_entity` |
| `GET` | `/entities/:name/relations` | Bidirectional knowledge graph edges for entity | `get_entity_relations` |
| `POST` | `/entities/relate` | Create a typed relation between two entities | `relate_entities` |

---

### Decisions

Immutable decision records with rationale — useful for audit trails and reasoning about past choices.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/decisions` | Record a decision | `record_decision` |
| `GET` | `/decisions` | List decisions, filter by project | `list_decisions` |
| `GET` | `/decisions/:id` | Retrieve a single decision by ID | _(new)_ |
| `DELETE` | `/decisions/:id` | Delete a decision record | _(new)_ |

---

### Session

Session continuity tools: orient at the start of a session, hand off at the end.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/session/orient` | Surface relevant memories + latest handoff to bootstrap context | `orient` |
| `POST` | `/session/wrap-up` | Log a summary event and create handoff | `wrap_up` |
| `POST` | `/session/handoff` | Explicit handoff with goal, state, open loops, next step | `create_handoff` |
| `GET` | `/session/handoff/latest` | Retrieve latest unconsumed handoff | `get_latest_handoff` |
| `GET` | `/session/handoffs` | List all handoffs (consumed or pending) | _(new)_ |
| `POST` | `/session/handoff/:id/consume` | Mark a specific handoff as consumed | _(new)_ |

---

### Triggers

Prospective memory: register conditions that fire when future inputs match.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/triggers` | Create a trigger with keywords and action | `create_trigger` |
| `GET` | `/triggers` | List active triggers | `list_triggers` |
| `GET` | `/triggers/check?q=` | Test a string against all active triggers | `check_triggers` |
| `GET` | `/triggers/:id` | Retrieve a single trigger by ID | _(new)_ |
| `PATCH` | `/triggers/:id` | Update trigger active state, expiry, or priority | _(new)_ |
| `POST` | `/triggers/:id/fire` | Manually fire a trigger (marks fired_at, deactivates) | _(new)_ |
| `DELETE` | `/triggers/:id` | Soft-delete a trigger (sets active=0) | `delete_trigger` |

---

### Procedures

Reusable workflows and conventions with confidence scores and execution feedback.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/procedures` | Create a procedure with goal and steps | `create_procedure` |
| `GET` | `/procedures/search?q=` | FTS search across goal, title, description | `search_procedures` |
| `GET` | `/procedures` | List procedures with status/scope filter | `list_procedures` |
| `GET` | `/procedures/:id` | Retrieve full procedure by ID | `get_procedure` |
| `PATCH` | `/procedures/:id` | Update procedure fields (goal, steps, status, confidence) | _(new)_ |
| `DELETE` | `/procedures/:id` | Delete a procedure | _(new)_ |
| `POST` | `/procedures/:id/feedback` | Record execution feedback (success, usefulness score) | `record_feedback` |

---

### Search & Reasoning

Cross-table search and LLM-powered reasoning grounded in stored memories.

#### Search

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/search?q=` | Unified FTS across memories + entities + events | `unified_search` |
| `GET` | `/vsearch?q=` | Vector-only semantic search across all record types | `vsearch` |
| `GET` | `/think?q=` | Spreading-activation BFS over the knowledge graph | `think` |
| `POST` | `/embeddings/backfill` | Embed all records missing vectors (run after enabling embeddings) | — |

#### Reasoning (requires `LITELLM_BASE_URL`)

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/reason` | Grounded Q&A: retrieve context → LLM answer with citations | `reason` |
| `POST` | `/infer` | Structured inference: premise → list of conclusions | `infer` |
| `POST` | `/infer/pretask` | Pre-task briefing: what does the agent know about this task? | `pretask` |
| `POST` | `/infer/gapfill` | Knowledge gap analysis: known facts, gaps, suggested questions | `gapfill` |
| `POST` | `/dream` | Dream synthesis: hypotheses from high-confidence memories | `dream` |

---

### Affect

Valence-Arousal-Dominance (VAD) classifier with threshold-based monitoring.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/affect` | Classify text and optionally store the result | `classify_affect` / `log_affect` |
| `GET` | `/affect/state` | Rolling VAD average over a time window | _(new)_ |
| `GET` | `/affect/history` | Recent affect log entries | _(new)_ |
| `PUT` | `/affect/thresholds/:metric` | Set a threshold alert for `valence`, `arousal`, or `dominance` | _(new)_ |
| `GET` | `/affect/thresholds` | List all configured thresholds | _(new)_ |
| `DELETE` | `/affect/thresholds/:id` | Remove a threshold | _(new)_ |
| `GET` | `/affect/monitor` | Check current affect against all thresholds, return breaches | `affect_monitor` |

---

### Consolidation

Memory consolidation engine. Inspired by biological sleep consolidation: the system periodically reorganises memories to strengthen important ones and discard noise.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/consolidation/run` | Run a full or partial consolidation cycle | `run_consolidation` |
| `GET` | `/consolidation/status` | Last run summary + history | `consolidation_status` |
| `POST` | `/consolidation/decay` | Pass 1: exponential confidence decay by temporal class | — |
| `POST` | `/consolidation/promote` | Pass 2: episodic → semantic for high-replay memories | — |
| `POST` | `/consolidation/compress` | Pass 3: cluster near-duplicate memories (vec or FTS Jaccard) | — |
| `POST` | `/consolidation/hebbian` | Pass 4: reinforce co-active edges, prune weak ones | — |
| `POST` | `/consolidation/gap-scan` | Pass 5: identify orphans, empty entities, broken edges | — |
| `POST` | `/consolidation/entity-tiers` | Pass 6: assign entity tier 1/2/3 by edge count | — |

**Consolidation passes in order:**

1. **Decay** — exponential confidence reduction by temporal class half-life (ephemeral: 3.5d, short: 10d, medium: 23d, long: 69d). Memories below `retire_threshold` (default 0.1) are soft-retired. Protected if `confidence ≥ 0.8 AND recalled_count ≥ 10`.
2. **Promote** — episodic memories with `replay_priority ≥ 0.3`, `ripple_tags ≥ 3`, `confidence ≥ 0.7` become semantic.
3. **Compress** — vec KNN clustering (distance ≤ 0.18) or FTS Jaccard fallback (≥ 0.4 overlap). Clusters of ≥ 3 merged into a single summary memory.
4. **Hebbian** — edges where both endpoints have `confidence ≥ 0.6` are boosted; others decay. Edges below 0.05 pruned.
5. **Gap scan** — read-only audit: orphaned FTS rows, empty entities, broken edges, missing vectors.
6. **Entity tiers** — tier 3 if `edges ≥ 20`, tier 2 if `edges ≥ 5`, tier 1 otherwise.

---

### Scheduler

Automatic consolidation via cron expressions (backed by `node-cron`).

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/scheduler` | Register a cron-scheduled consolidation job | — |
| `GET` | `/scheduler` | List all schedules | — |
| `GET` | `/scheduler/:id` | Get a specific schedule | — |
| `DELETE` | `/scheduler/:id` | Remove a schedule | — |
| `POST` | `/scheduler/:id/pause` | Pause without deleting | — |
| `POST` | `/scheduler/:id/resume` | Resume a paused schedule | — |

---

### Knowledge Graph

The `knowledge_edges` table connects any two records (memories, entities, events) with a typed, weighted directed edge. PageRank and graph traversal run directly over this table.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/graph/pagerank` | Weighted PageRank over agent's subgraph | `pagerank` |
| `GET` | `/graph/whosknows?q=` | Which entities have the most knowledge touching a topic? | `whos_knows` |
| `GET` | `/graph/traverse` | BFS traversal from a seed node with depth limit | `traverse` |
| `GET` | `/graph/edges` | List edges with type/id/relation filters | _(new)_ |
| `POST` | `/graph/edges` | Create an edge manually | _(new)_ |
| `PATCH` | `/graph/edges/:id/weight` | Update an edge weight | `weights` |
| `DELETE` | `/graph/edges/:id` | Delete an edge | _(new)_ |
| `POST` | `/graph/events/:id/link` | Explicitly link an event to memories/entities | `event_link` |
| `GET` | `/graph/events/:id/links` | Get all edges from an event | _(new)_ |
| `PUT` | `/graph/epochs/:label` | Create a named temporal epoch | `epoch` |
| `POST` | `/graph/epochs/:label/close` | Close an epoch (set end timestamp) | _(new)_ |
| `GET` | `/graph/epochs` | List all epochs | _(new)_ |
| `GET` | `/graph/epochs/:label/memories` | Memories created during an epoch's time window | _(new)_ |

---

### Admin

Bulk operations, data management, and maintenance. The `confirm=true` guard on the wipe endpoint is a hard requirement.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/admin/memories/bulk` | Import up to 1 000 memories at once | `bulk_import` |
| `DELETE` | `/admin/memories/retired` | Hard-delete soft-retired memories (optionally older than N days) | — |
| `GET` | `/admin/export` | Full agent data export as JSON | `export_data` |
| `DELETE` | `/admin/agent?confirm=true` | Irreversibly wipe all data for an agent | `wipe_agent` |
| `GET` | `/admin/backup` | Stream a live SQLite backup (`.db` file download) | `backup` |
| `POST` | `/admin/reindex` | Rebuild all FTS5 indexes | — |
| `GET` | `/admin/breakdown` | Memory stats by category, type, temporal class; top accessed | `breakdown` |

---

### Multi-Agent

All tables are isolated by `agent_id`. These endpoints manage the relationships between agents.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/agents` | List all known agents with activity counts | `list_agents` |
| `GET` | `/agents/:id/state` | Key-value state for an agent (all or single key) | `get_agent_state` |
| `PUT` | `/agents/:id/state` | Set multiple state keys | `set_agent_state` |
| `DELETE` | `/agents/:id/state/:key` | Delete a state key | — |
| `POST` | `/agents/:id/share` | Copy memories from this agent to another | `share_memories` |
| `POST` | `/agents/:id/transfer` | Transfer the latest handoff to another agent | `transfer_handoff` |

---

### Diagnostics

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/health` | FTS5/vec availability, DB size, integrity, embedding status | `health` |
| `GET` | `/stats` | Count of every record type + optional vec counts | `stats` |

---

### Context

Long-document ingestion with automatic chunking and per-chunk vector search.

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/context/:document` | Ingest/re-ingest a named document; auto-chunks at `chunk_size` words (default 300) with `overlap` (default 50) |
| `GET` | `/context` | List all documents for an agent |
| `GET` | `/context/:document` | Retrieve all chunks in order |
| `GET` | `/context/:document/:chunk_index` | Retrieve a single chunk by zero-based index |
| `DELETE` | `/context/:document` | Remove all chunks for a document |
| `POST` | `/context/search` | Hybrid FTS5+vec search across chunks, optionally filtered by document |

---

### Analytics

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/analytics/validate` | Deep DB consistency check: orphaned FTS rows, missing embeddings, broken edges | `validate` / `lint` |
| `GET` | `/analytics/free-energy` | Homeostatic memory pressure score (0–1) with capacity recommendations | `free_energy_check` |
| `GET` | `/analytics/allostatic-prime` | Memories near decay threshold ranked by decay risk — surface before consolidation | `allostatic_prime` |
| `GET` | `/analytics/demand-forecast` | Recency-weighted access prediction for the top N memories | `demand_forecast` |
| `POST` | `/analytics/retrieval-effectiveness` | Offline precision@k / recall@k for a set of (query, expected_ids) test cases | `retrieval_effectiveness` |

---

### Cognitive Subsystems

Six lightweight in-process "subsystems" that model higher-order cognitive processes. All tables are created lazily on first write.

#### Belief
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/belief` | Upsert a belief with confidence and evidence | `upsert_belief` |
| `GET` | `/belief` | List beliefs, optionally filtered by minimum confidence | `list_beliefs` |
| `DELETE` | `/belief/:id` | Delete a belief by ID | _(new)_ |

#### Trust
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/trust/interaction` | Record a positive / negative / neutral outcome with a target | `record_interaction` |
| `GET` | `/trust` | List all trust records sorted by score | `list_trust` |
| `GET` | `/trust/:target` | Get trust score for a named target | `get_trust` |

Trust score starts at 0.5 and updates: +0.05 for positive, −0.08 for negative, 0 for neutral. Clamped to [0, 1].

#### Reflexion
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/reflexion` | Reflect on an action/outcome; optionally generate an LLM lesson stored as semantic memory | `reflect` |
| `GET` | `/reflexion` | List reflections most-recent first | `list_reflections` |

#### Workspace
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `PUT` | `/workspace/:name` | Create or update a named scratchpad | `upsert_workspace` |
| `GET` | `/workspace` | List workspace items, optionally filter by status | `list_workspace` |
| `GET` | `/workspace/:name` | Retrieve a specific workspace item | `get_workspace` |
| `DELETE` | `/workspace/:name` | Delete a workspace item | _(new)_ |

#### Tasks
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/tasks` | Create a task with priority (`critical` / `high` / `medium` / `low`) | `create_task` |
| `GET` | `/tasks` | List tasks, filter by status and assignee | `list_tasks` |
| `GET` | `/tasks/:id` | Retrieve a single task by ID | _(new)_ |
| `PATCH` | `/tasks/:id/status` | Update task status and optional result | `update_task_status` |
| `DELETE` | `/tasks/:id` | Delete a task | _(new)_ |

#### Policies
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `PUT` | `/policy/:name` | Upsert a named policy rule | `upsert_policy` |
| `POST` | `/policy/:name/evaluate` | Evaluate a policy rule against a context string using LLM | `evaluate_policy` |
| `GET` | `/policy` | List policies (active only by default) | `list_policies` |

---

### Subsystem Meta-API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subsystems` | List all six subsystems with live record counts |
| `POST` | `/subsystems/:name/emit` | Append a typed event to a subsystem's audit log |
| `GET` | `/subsystems/:name/events` | Query the subsystem event log |
| `PUT` | `/subsystems/:name/config` | Set per-agent key-value configuration for a subsystem |
| `GET` | `/subsystems/:name/config` | Retrieve subsystem configuration |

---

### Theory of Mind

Model what another agent believes or intends based on their memory records.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/tom/model` | Generate a ToM model: observer searches subject's memories → LLM extracts beliefs/intentions | `tom` |
| `GET` | `/tom/:observer/model/:subject` | Retrieve the latest ToM model for a subject | _(new)_ |
| `GET` | `/tom/:observer/models` | List all models produced by an observer | _(new)_ |

---

### Budget

Token and call-count budgeting per agent. Useful when embedding brainctl in agentic pipelines with cost controls.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `PUT` | `/budget/:agent_id` | Set or update token/call budget limits | `budget_set` |
| `GET` | `/budget/:agent_id` | Get current usage vs. limits | `budget_status` |
| `POST` | `/budget/:agent_id/usage` | Record token and/or call usage | _(new)_ |
| `POST` | `/budget/:agent_id/reset` | Reset usage counters | _(new)_ |

---

### Push & Webhooks

Deliver memories or structured reports to external services.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `PUT` | `/webhooks/:name` | Register or update a webhook URL | _(new)_ |
| `GET` | `/webhooks` | List all active webhooks | _(new)_ |
| `DELETE` | `/webhooks/:name` | Remove a webhook | _(new)_ |
| `POST` | `/push` | Push matching memories to a webhook (by query or ID list) | `push` |
| `POST` | `/push/report` | Deliver a structured report payload to a webhook | `push_report` |

---

## Database Schema

All tables live in a single SQLite file. Key tables:

| Table | Purpose |
|-------|---------|
| `memories` | Core memory store with FTS5 (`memories_fts`) and optional `vec_memories` |
| `entities` | Named concepts with FTS5 (`entities_fts`) and optional `vec_entities` |
| `events` | Append-only observation log with FTS5 (`events_fts`) |
| `knowledge_edges` | Typed, weighted directed edges between any records |
| `decisions` | Immutable decision records |
| `triggers` | Prospective memory conditions |
| `handoffs` | Session state transfer packets |
| `procedures` | Reusable workflows with FTS5 (`procedures_fts`) |
| `procedure_feedback` | Execution outcomes for procedure confidence updates |
| `agent_state` | Per-agent key-value store |
| `affect_log` | VAD scores with safety flag annotations |
| `consolidation_log` | Audit trail of consolidation cycle runs |
| `context` | Chunked document storage with FTS5 (`context_fts`) and `vec_context` |
| `beliefs` | Per-agent graded belief set (lazy) |
| `trust_records` | Trust scores for named targets (lazy) |
| `reflections` | Action/outcome reflection log (lazy) |
| `workspace` | Named scratchpad items (lazy) |
| `tasks` | Shared task queue (lazy) |
| `policies` | Named rule definitions (lazy) |
| `epochs` | Named temporal segments (lazy) |
| `tom_models` | Theory of Mind model snapshots (lazy) |
| `agent_budgets` | Token/call budget tracking (lazy) |
| `webhooks` | Registered push destinations (lazy) |
| `subsystem_config` | Per-agent subsystem key-value config (lazy) |
| `subsystem_events` | Subsystem audit log (lazy) |
| `affect_thresholds` | VAD threshold alert definitions (lazy) |

FTS5 tables use `content=` (external content) with `AFTER INSERT/UPDATE/DELETE` triggers to stay in sync with their base tables.

---

## Search Architecture

When `LITELLM_BASE_URL` is set and `sqlite-vec` is loaded, search uses **Reciprocal Rank Fusion (RRF)**:

```
score(d) = 1/(K + rank_fts(d)) + 1/(K + rank_vec(d))   K = 60
```

FTS5 and vector results are ranked independently and merged. The K=60 constant dampens the impact of rank position differences near the top of each list. If either source is unavailable the other is used directly.

---

## LLM Degradation

Every LLM call has a fallback path:

- **Embeddings unavailable** → store/search without vectors; FTS5 only
- **LLM unavailable** → reasoning endpoints return a degraded response with `[LLM unavailable]` noted
- **Policy evaluation with no LLM** → defaults to `allowed: true` (fail-open)
- **Reflexion lesson generation** → skipped; reflection is stored without a lesson

---

## Endpoint Count Summary

| Category | Endpoints |
|----------|-----------|
| Core memory | 6 |
| Memory lifecycle | 9 |
| Events | 6 |
| Entities | 7 |
| Decisions | 4 |
| Session | 6 |
| Triggers | 7 |
| Procedures | 7 |
| Search & reasoning | 9 |
| Affect | 7 |
| Consolidation | 8 |
| Scheduler | 6 |
| Knowledge graph | 13 |
| Admin | 7 |
| Multi-agent | 6 |
| Diagnostics | 2 |
| Context | 6 |
| Analytics | 5 |
| Subsystems (6 × 2–5) | 21 |
| Subsystem meta | 5 |
| Theory of Mind | 3 |
| Budget | 4 |
| Push & webhooks | 5 |
| **Total** | **170** |
