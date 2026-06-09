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

---

### Session

Session continuity tools: orient at the start of a session, hand off at the end.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `GET` | `/session/orient` | Surface relevant memories + latest handoff to bootstrap context | `orient` |
| `POST` | `/session/wrap-up` | Log a summary event and create handoff | `wrap_up` |
| `POST` | `/session/handoff` | Explicit handoff with goal, state, open loops, next step | `create_handoff` |
| `GET` | `/session/handoff/latest` | Retrieve latest unconsumed handoff | `get_latest_handoff` |

---

### Triggers

Prospective memory: register conditions that fire when future inputs match.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/triggers` | Create a trigger with keywords and action | `create_trigger` |
| `GET` | `/triggers` | List active triggers | `list_triggers` |
| `GET` | `/triggers/check?q=` | Test a string against all active triggers | `check_triggers` |
| `DELETE` | `/triggers/:id` | Remove a trigger | `delete_trigger` |

---

### Procedures

Reusable workflows and conventions with confidence scores and execution feedback.

| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/procedures` | Create a procedure with goal and steps | `create_procedure` |
| `GET` | `/procedures/search?q=` | FTS search across goal, title, description | `search_procedures` |
| `GET` | `/procedures` | List procedures with status/scope filter | `list_procedures` |
| `GET` | `/procedures/:id` | Retrieve full procedure by ID | `get_procedure` |
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

#### Tasks
| Method | Path | Description | MCP equivalent |
|--------|------|-------------|----------------|
| `POST` | `/tasks` | Create a task with priority (`critical` / `high` / `medium` / `low`) | `create_task` |
| `PATCH` | `/tasks/:id/status` | Update task status and optional result | `update_task_status` |
| `GET` | `/tasks` | List tasks, filter by status and assignee | `list_tasks` |

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
| Core memory | 4 |
| Memory lifecycle | 9 |
| Events | 3 |
| Entities | 5 |
| Decisions | 2 |
| Session | 4 |
| Triggers | 4 |
| Procedures | 5 |
| Search & reasoning | 9 |
| Affect | 7 |
| Consolidation | 8 |
| Scheduler | 6 |
| Knowledge graph | 13 |
| Admin | 7 |
| Multi-agent | 6 |
| Diagnostics | 2 |
| Context | 5 |
| Analytics | 5 |
| Subsystems (6 × 2–3) | 17 |
| Subsystem meta | 5 |
| Theory of Mind | 3 |
| Budget | 4 |
| Push & webhooks | 5 |
| **Total** | **153** |
