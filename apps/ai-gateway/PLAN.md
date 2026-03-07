# AI Gateway — Personal Assistant Evolution Plan

## Vision

Transform the AI gateway from a single-agent dispatcher into a **personal AI operating system** — a
deeply integrated, multi-specialist assistant network that covers every dimension of daily life and
work. The orchestrator becomes a thoughtful executive that delegates to domain experts, combines
their answers, and builds a coherent mental model of you over time.

The system already has a solid foundation:

- A streaming orchestrator that delegates to named sub-agents
- A typed tool registry with category/tag indexing
- Human-in-the-loop approval gating
- Per-request stateless chat with full message-history replay
- External MCP service proxy support
- Metrics collection and scaling roadmap

Everything below builds on that foundation without breaking it.

---

## Current State (Baseline)

```
OrchestratorAgent
  └─ utility-assistant (qwen3:4b)
       tools: get_current_time, calculate, http_request,
              sensitive_action, ask_user
```

One generalist sub-agent with five primitive tools. The orchestrator has nothing to route to except
this one agent, so every query lands there regardless of domain.

---

## Target State

```
OrchestratorAgent (qwen3.5:9b)
  ├─ TemporalAgent        → time, calendar, scheduling, countdowns
  ├─ MeteorologistAgent   → weather, forecasts, AQI, pollen, UV, astronomical data
  ├─ ResearchAgent        → web search, Wikipedia, news, RSS, translation, summarization
  ├─ ProductivityAgent    → tasks/kanban, notes, reminders, focus blocks, habits
  ├─ FinanceAgent         → budget tracking, currency FX, crypto/stocks, expense logging
  ├─ HealthAgent          → Whoop biometrics, nutrition, hydration, wellness nudges
  ├─ CommunicationAgent   → ntfy notifications, email/message drafting, meeting invites
  ├─ FoodAgent            → recipes, meal planning, grocery lists, substitutions
  ├─ MathAgent            → calculations, unit conversion, statistics, equations
  ├─ FormatterAgent       → JSON, diffs, encoding, color conversion, table rendering
  ├─ NetworkAgent         → HTTP requests, IP/DNS lookup, URL tools, SSL checks
  └─ SecurityAgent        → password gen, UUIDs, hashing, TOTP, password strength
```

Each agent carries only the tools relevant to its domain. The orchestrator's routing prompt
explicitly describes each specialist's scope, so the LLM can route, fan-out, and synthesize
across multiple agents in a single user turn.

---

## Phase 1 — Tool Expansion (Foundation)

### 1.1 Temporal Tools (`category: "temporal"`)

| Tool                    | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `get_current_time`      | Already exists — extend with timezone list + DST info                            |
| `get_date_info`         | Day of week, week number, days until end of quarter/year, fiscal year            |
| `convert_timezone`      | Convert a timestamp between any two IANA timezones                               |
| `time_until`            | Countdown to a named date/event (e.g. "how many days until Christmas")           |
| `time_since`            | Elapsed time since a past date (anniversaries, project age)                      |
| `format_duration`       | Convert seconds → human-readable "2 hours 34 minutes"                            |
| `business_days`         | Working days between two dates respecting holiday set                            |
| `schedule_reminder`     | Store a reminder (in-memory or Redis) that fires a push notification via ntfy    |
| `list_calendar_events`  | iCloud/Google Calendar events for a time window via CalDAV                       |
| `get_daily_agenda`      | Today's schedule as a narrative — events, tasks due, and weather rolled into one |
| `create_calendar_event` | Add a calendar event (approval-gated); writes via CalDAV                         |
| `find_free_time`        | Suggest available meeting slots given existing calendar events                   |

Calendar reads use `ical.js` over a CalDAV `PROPFIND` request. Writes use a CalDAV `PUT`.
Credentials are stored in `UserContext` (`calDavUrl`, `calDavUsername`, `calDavPassword`).
iCloud works out of the box with an app-specific password; Google Calendar requires a
CalDAV bridge URL from Google Workspace.

**TemporalAgent system prompt:** Precision-oriented scheduler and calendar assistant. Always
clarifies timezone from user context. Returns both human-readable and ISO-8601 forms. Understands
relative expressions ("next Tuesday", "in 3 weeks", "end of Q2"). When asked about schedules or
free time, checks calendar events first before answering. All calendar writes require approval.

---

### 1.2 Weather & Environmental Tools (`category: "weather"`)

Uses [Open-Meteo](https://open-meteo.com/) (free, no API key) as primary source.
Falls back to `wttr.in` for quick text summaries.

| Tool                        | Description                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| `get_current_weather`       | Temp, feels-like, humidity, wind, precipitation, conditions           |
| `get_hourly_forecast`       | Next 24–48h hour-by-hour (temp, precip probability, wind gusts)       |
| `get_daily_forecast`        | 7-day summary with high/low, precip chance, dominant condition        |
| `get_weather_alerts`        | Severe weather warnings from NWS/Environment Canada/local API         |
| `get_air_quality`           | AQI, PM2.5, PM10, O3, NO2 (Open-Meteo AQ API)                         |
| `get_pollen_forecast`       | Grass/tree/weed pollen levels by day                                  |
| `get_uv_index`              | Current and max UV for the day + burn-time estimate                   |
| `get_astronomical_data`     | Sunrise, sunset, golden hour, moonrise, moon phase, moon illumination |
| `get_precipitation_nowcast` | Minute-by-minute rain probability for next 2h (radar-based)           |
| `get_weather_history`       | Historical daily averages for a city on a given date                  |
| `compare_locations_weather` | Side-by-side weather for multiple cities (travel planning)            |

**MeteorologistAgent system prompt:** Speaks like an enthusiastic meteorologist. Interprets models,
explains "why" behind forecasts (pressure systems, fronts). Proactively mentions outdoor-activity
relevance ("great day for a run — UV is 3, light winds, 0% rain after 10am"). Always includes
units appropriate to the user's locale.

---

### 1.3 Research & Information Tools (`category: "research"`)

| Tool                | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `web_search`        | DuckDuckGo Instant Answers API or SearXNG self-hosted instance         |
| `fetch_url`         | Upgrade of `http_request` — fetches + strips HTML → clean text summary |
| `wikipedia_lookup`  | Summary + key facts for any entity via Wikipedia REST API              |
| `get_news`          | Top headlines via GNews/NewsAPI or RSS parsing (configurable sources)  |
| `fetch_rss_feed`    | Parse any RSS/Atom feed, return N latest items with summaries          |
| `summarize_text`    | LLM-powered summarization of pasted text (uses `ollama.complete`)      |
| `extract_key_facts` | Extract structured facts from a URL or pasted content                  |
| `academic_search`   | Semantic Scholar or arXiv search for papers by topic                   |
| `define_word`       | Dictionary definition, etymology, synonyms (Free Dictionary API)       |
| `translate_text`    | Translation via LibreTranslate (self-hostable)                         |

**ResearchAgent system prompt:** Fact-first, citations always. Distinguishes between "I found
this" and "I inferred this". Returns source URLs. Knows when to use Wikipedia vs news vs academic
sources for different question types.

---

### 1.4 Productivity Tools (`category: "productivity"`)

Bridges into the monorepo's kanban backend (`apps/kanban`).

| Tool                | Description                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| `create_task`       | POST to kanban API — create task with title, description, priority, due date |
| `list_tasks`        | GET kanban tasks with optional state/project filter                          |
| `update_task`       | PATCH a task (priority, description, state transition)                       |
| `get_todays_tasks`  | Tasks due today or in-progress across all projects                           |
| `create_note`       | Store a timestamped note in a lightweight local notes store                  |
| `list_notes`        | Retrieve notes by date range or keyword                                      |
| `search_notes`      | Semantic search across notes                                                 |
| `start_focus_block` | Record focus session start; send ntfy "Focus mode on 🎯"                      |
| `end_focus_block`   | Record end, compute duration, log to metrics                                 |
| `get_habit_streak`  | Simple streak tracker (configurable daily habits)                            |
| `check_habit`       | Mark a habit complete for today                                              |
| `add_reminder`      | Persist a reminder tied to a datetime, delivered via ntfy                    |

**ProductivityAgent system prompt:** Acts as a pragmatic chief-of-staff. Connects dots between
open tasks, upcoming deadlines, and available time. Suggests batching similar tasks. Aware of the
user's preferred working rhythm (configurable in UserContext).

---

### 1.5 Finance Tools (`category: "finance"`)

Bridges into `apps/finances` for personal data; public APIs for market data.

| Tool                          | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `get_exchange_rate`           | Live FX rate for any currency pair (Frankfurter API — free)     |
| `convert_currency`            | Convert amount between currencies with timestamp                |
| `get_crypto_price`            | Price, 24h change, market cap (CoinGecko free tier)             |
| `get_stock_quote`             | Last price + day change (Yahoo Finance scrape or Alpha Vantage) |
| `track_expense`               | POST to finances API — log a transaction                        |
| `get_spending_summary`        | From finances API — monthly/weekly breakdown by category        |
| `get_budget_status`           | Remaining budget per category for current period                |
| `calculate_tip`               | Quick tip calculator with split-bill option                     |
| `calculate_loan`              | Monthly payment, total interest for given principal/rate/term   |
| `calculate_compound_interest` | Savings growth projection                                       |

**FinanceAgent system prompt:** Analytical, precise. Never recommends specific investments. Uses
the user's home currency by default. Connects spending data to budgets proactively ("you're 83%
through your dining budget with 12 days left this month").

---

### 1.6 Health & Wellness Tools (`category: "health"`)

#### General wellness (always available)

| Tool                        | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `lookup_nutrition`          | Calories, macros, micros for a food item (Open Food Facts API)   |
| `log_water`                 | Increment daily water intake counter (persisted in store)        |
| `get_water_status`          | Current vs target water intake today                             |
| `log_sleep`                 | Manual sleep log — used as fallback when Whoop is not configured |
| `get_sleep_summary`         | 7-day sleep quality summary from manual log (fallback)           |
| `log_exercise`              | Manual exercise log — fallback when Whoop is not configured      |
| `get_activity_summary`      | Weekly exercise log from manual entries (fallback)               |
| `calculate_bmi`             | BMI + healthy range context                                      |
| `calculate_calories_burned` | Estimate calories for activity type/duration/weight              |
| `get_supplement_info`       | Evidence summary for a supplement (from examine.com scrape)      |
| `send_wellness_nudge`       | ntfy push "Time to move!" / "Drink some water" type nudge        |

#### Whoop integration (`WHOOP_ACCESS_TOKEN` required)

WHOOP uses OAuth2. The gateway exposes a `/config/whoop/auth` initiation route that redirects
to Whoop's authorization URL and exchanges the code for tokens, which are then persisted in
the `UserContext` store. For personal use a long-lived personal access token can also be set
directly via `WHOOP_ACCESS_TOKEN` env var. All tools call `https://api.prod.whoop.com/developer`
with the stored bearer token.

OAuth2 scopes needed: `read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement`

| Tool                          | Whoop API endpoint                         | Key data returned                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whoop_get_recovery`          | `GET /v2/recovery` (latest + cycle lookup) | Recovery score (0–100), HRV (rMSSD ms), RHR, SpO2 %, skin temp °C                                                                                                                               |
| `whoop_get_recovery_history`  | `GET /v2/recovery?limit=N`                 | N-day recovery score trend + HRV trend                                                                                                                                                          |
| `whoop_get_sleep`             | `GET /v2/activity/sleep` (latest)          | Sleep performance %, efficiency %, consistency %, respiratory rate, stage breakdown (slow wave / REM / light / awake), sleep needed vs actual                                                   |
| `whoop_get_sleep_history`     | `GET /v2/activity/sleep?limit=N`           | N nights of sleep data for weekly/monthly trend analysis                                                                                                                                        |
| `whoop_get_day_strain`        | `GET /v2/cycle` (latest)                   | Day strain score (0–21), total kJ burned, avg/max HR for the day                                                                                                                                |
| `whoop_get_strain_history`    | `GET /v2/cycle?limit=N`                    | Strain trends over N days — useful for load management advice                                                                                                                                   |
| `whoop_get_workouts`          | `GET /v2/activity/workout?limit=N`         | Recent workouts: sport name, strain, HR zones, distance, calories burned                                                                                                                        |
| `whoop_get_workout_detail`    | `GET /v2/activity/workout/{workoutId}`     | Full detail for one workout including zone duration breakdown                                                                                                                                   |
| `whoop_get_body_measurements` | `GET /v2/user/measurement/body`            | Height, weight, max HR from Whoop profile                                                                                                                                                       |
| `whoop_get_readiness_brief`   | Synthesized (recovery + sleep + strain)    | Single-paragraph readiness narrative: "Your 72% recovery + 98% sleep performance suggests you're ready for a hard effort today. Yesterday's strain was 14.2 — consider staying below 15 today." |

**HealthAgent system prompt:** Supportive, non-judgmental biometric coach. When Whoop data is
available, leads with real physiological metrics rather than estimates. Interprets recovery,
HRV trends, and sleep stages in plain language. Uses the recovery score + strain history to give
concrete training recommendations ("green day — push hard", "yellow — moderate only", "red — rest
or easy movement"). Falls back to manual log tools when `WHOOP_ACCESS_TOKEN` is not set. Always
reminds that these are informational metrics, not medical advice.

---

### 1.7 Communication Tools (`category: "communication"`)

Uses the ntfy instance already deployed (`deployments/ntfy/`).

| Tool                         | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `send_notification`          | POST to ntfy — priority, title, message, click URL, tags (emoji icons) |
| `send_timed_reminder`        | Schedule ntfy push at a specific time (via delay loop or cron)         |
| `draft_email`                | LLM-compose a professional or casual email from bullet-point intent    |
| `draft_message`              | Compose a short text/chat message from intent                          |
| `summarize_email_thread`     | Paste a thread, get a structured summary + suggested action            |
| `get_notifications_history`  | Retrieve recent ntfy messages sent by the gateway                      |
| `create_meeting_invite_text` | Generate iCal-friendly plain-text meeting invite block                 |

**CommunicationAgent system prompt:** Tone-matching master. Knows when to be concise vs elaborate.
Suggests subject lines. Anticipates replies. For drafts, always offers both "formal" and "casual"
variants unless style is obvious from context.

---

### 1.8 Food & Recipe Tools (`category: "food"`)

Bridges into `apps/recipes` backend.

| Tool                              | Description                                                         |
| --------------------------------- | ------------------------------------------------------------------- |
| `search_recipes`                  | Search recipe library by ingredient, cuisine, tag                   |
| `get_recipe`                      | Full recipe detail (ingredients, steps, nutrition)                  |
| `suggest_recipe_from_ingredients` | "What can I make with chicken, lemon, garlic?"                      |
| `create_meal_plan`                | Weekly meal plan from preferences + pantry                          |
| `generate_grocery_list`           | Aggregate ingredients from a meal plan → deduplicated shopping list |
| `scale_recipe`                    | Adjust serving size, recompute all measurements                     |
| `get_recipe_nutrition`            | Nutritional breakdown for a specific recipe                         |
| `lookup_ingredient_substitution`  | "I'm out of X, what can I use instead?"                             |
| `get_cooking_technique`           | Explanation of a cooking method with tips                           |
| `get_wine_pairing`                | Wine recommendations for a dish                                     |

**FoodAgent system prompt:** Enthusiastic home cook with professional knowledge. Takes pantry
constraints seriously. Suggests the simplest approach for weeknights and more elaborate options
for weekends. Integrates nutrition data when user has health goals active.

---

### 1.9 Math & Calculation Tools (`category: "math"`)

Replaces the numeric subset of the old `utility-assistant`. Pure computation — no network calls.

| Tool                   | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `calculate`            | Already exists — safe `new Function()` expression evaluator                     |
| `convert_units`        | Length, weight, temperature, volume, speed, area, energy, data sizes            |
| `calculate_percentage` | X% of Y, percentage change between two values, X is what % of Y                 |
| `solve_equation`       | Linear and quadratic equations via `math.js` — returns exact + decimal solution |
| `statistics_summary`   | Mean, median, mode, std dev, min/max for a list of numbers                      |

**MathAgent system prompt:** Precise and terse. Shows working when the calculation is non-trivial.
Always states units in the answer. Falls back to `calculate` for expressions math.js can't parse.
Model: `qwen3:4b` — pure computation, no creativity needed.

---

### 1.10 Formatter & Text Tools (`category: "formatter"`)

Data transformation, text processing, and rendering utilities.

| Tool             | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `format_json`    | Pretty-print or minify JSON; optionally sort keys                           |
| `validate_json`  | Validate JSON string — returns path-annotated errors on failure             |
| `diff_text`      | Unified diff between two text blocks; highlights additions and removals     |
| `encode_decode`  | Base64, URL-encode, HTML entity, hex — direction auto-detected from context |
| `get_color_info` | HEX ↔ RGB ↔ HSL ↔ color name + WCAG contrast ratio against white/black      |
| `format_table`   | Convert a JSON array of objects into a markdown table                       |
| `count_tokens`   | Estimate LLM token count for a string (cl100k_base tiktoken approximation)  |
| `case_convert`   | camelCase ↔ snake_case ↔ kebab-case ↔ UPPER_SNAKE ↔ Title Case              |

**FormatterAgent system prompt:** Deterministic transformer. No guessing — applies the exact
requested transformation and returns the result. Points out potential data loss (e.g. truncated
floats in JSON). Model: `qwen3:4b`.

---

### 1.11 Network & Web Tools (`category: "network"`)

HTTP, DNS, and URL diagnostic utilities.

| Tool             | Description                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `http_request`   | Upgraded from system-tools: GET/POST/PUT/PATCH, custom headers, JSON body, 50KB response limit |
| `get_ip_info`    | Geolocation, ASN, and org lookup for an IP address or hostname                                 |
| `dns_lookup`     | Resolve DNS records (A, AAAA, MX, TXT, CNAME) for a domain                                     |
| `ping_url`       | HTTP HEAD reachability check + round-trip latency                                              |
| `qr_code_url`    | Generate a QR code image URL for any string via a free API                                     |
| `shorten_url`    | Shorten a URL via a free shortener service                                                     |
| `parse_url`      | Decompose a URL into scheme, host, path, query params, and fragment                            |
| `check_ssl_cert` | SSL certificate validity, issuer, and days-until-expiry for a hostname                         |

**NetworkAgent system prompt:** Methodical network diagnostician. Interprets HTTP status codes,
DNS records, and SSL errors in plain language. Knows when a 301 vs 302 matters. Suggests next
steps when a check fails. Model: `qwen3.5:4b`.

---

### 1.12 Security & Secrets Tools (`category: "security"`)

Secret generation, cryptographic utilities, and credential hygiene tools.

| Tool                      | Description                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `generate_password`       | Secure random password — configurable length, character sets, excludes ambiguous chars |
| `generate_uuid`           | v4 (random) or v7 (time-ordered) UUID                                                  |
| `hash_text`               | MD5, SHA-1, SHA-256, SHA-512 of a string — returns hex digest                          |
| `check_password_strength` | zxcvbn-style strength score (0–4), crack-time estimate, improvement suggestions        |
| `generate_totp_uri`       | TOTP secret + `otpauth://` URI for setting up 2FA in an authenticator app              |

**SecurityAgent system prompt:** Security-conscious and non-judgmental. Never logs or echoes back
raw secrets. When checking password strength, gives actionable feedback without lecturing.
Model: `qwen3:4b`.

> **Note — `ask_user` and `sensitive_action`:** These approval-gated meta-tools remain in
> `system-tools.ts` and are available to any agent via the orchestrator. They are not
> scoped to a specific domain agent.

---

## Phase 2 — Orchestrator Intelligence Upgrades

### 2.1 Parallel Agent Fanout

Currently the orchestrator delegates **sequentially**: it calls one agent, waits, then decides
the next step. For queries that naturally span multiple domains, this is slow.

**New pattern: parallel delegation**

```typescript
// New orchestrator tool: delegate_to_agents (plural)
{
  name: 'delegate_to_agents',
  description: 'Delegate subtasks to multiple agents in parallel',
  parameters: {
    tasks: [{ agentName: string, task: string }]
  }
}
```

When the orchestrator identifies that N independent subtasks can run simultaneously — e.g.
"what should I wear tomorrow?" routes to [MeteorologistAgent("forecast"), HealthAgent("exercise plan")]
— it calls `delegate_to_agents` with an array. The runtime executes all tasks with `Promise.all`
and returns all results before the orchestrator synthesizes the final answer.

### 2.2 Model Tier Assignment

Not all agents need the same model. Assign models by domain complexity:

Available models on `ollama.elliott.haus`:

| Model         | Params | Family  | Notes                       |
| ------------- | ------ | ------- | --------------------------- |
| `qwen3.5:9b`  | 9.7B   | qwen35  | Largest / most capable      |
| `qwen3:8b`    | 8.2B   | qwen3   | Solid general-purpose       |
| `qwen3.5:4b`  | 4.7B   | qwen35  | Fast, newer qwen3.5 family  |
| `qwen3:4b`    | 4.0B   | qwen3   | Fast, already in production |
| `qwen3-vl:4b` | 4.4B   | qwen3vl | Vision-language (images)    |

Tier assignment:

| Tier                                 | Model         | Agents                                                                      |
| ------------------------------------ | ------------- | --------------------------------------------------------------------------- |
| **Heavy** (reasoning, synthesis)     | `qwen3.5:9b`  | Orchestrator, ResearchAgent                                                 |
| **Standard** (structured tool calls) | `qwen3:8b`    | FinanceAgent, ProductivityAgent, HealthAgent, FoodAgent, CommunicationAgent |
| **Light** (lookup + network)         | `qwen3.5:4b`  | TemporalAgent, MeteorologistAgent, NetworkAgent                             |
| **Minimal** (pure computation)       | `qwen3:4b`    | MathAgent, FormatterAgent, SecurityAgent                                    |
| **Vision** (image input)             | `qwen3-vl:4b` | Any request with an attached image                                          |

Model can be overridden at request time via `config.agentModels`.

### 2.3 User Context & Preferences

Add a `UserContext` singleton (or per-session config) that all agents read:

```typescript
interface UserContext {
  location: { city: string; lat: number; lon: number; timezone: string };
  units: 'metric' | 'imperial';
  currency: 'CAD' | 'USD' | 'EUR' | string;
  locale: string; // 'en-CA'
  workHours: { start: string; end: string }; // '09:00'–'17:00'
  healthGoals?: { dailyWaterMl: number; sleepHours: number; calories?: number };
  preferredModels?: Partial<Record<AgentName, string>>;
  ntfyTopic?: string;
  homeAssistantToken?: string;
}
```

Stored in a small JSON config file (or Redis). Exposed via `GET /config/user-context` and
`PATCH /config/user-context`. Every agent receives the current context injected into its system
prompt preamble.

### 2.4 Agent Memory (Conversation Continuity)

Each named agent gets an optional `SharedMemoryStore` — a rolling window of the last N tool calls
and results, persisted across conversations:

- MeteorologistAgent remembers the last known location for quick follow-ups ("what about tomorrow?")
- ProductivityAgent remembers in-flight task creation so it can reference "that task I just made"
- FoodAgent remembers "current meal plan" and pantry state
- HealthAgent remembers the last readiness brief so follow-up questions don't re-fetch Whoop data

A simple `Map<agentName, MemoryEntry[]>` with a configurable max-entries cap is sufficient for
Phase 2. Phase 3 can graduate to Redis.

### 2.5 Proactive Nudges

A scheduled background process (cron every few minutes) that can push without a user prompt:

- **Weather nudge**: rain expected during commute time → ntfy push with umbrella reminder
- **Morning briefing**: 7am daily summary of agenda, weather, open tasks, budget status
- **Budget warning**: >80% spend with >7 days remaining in period
- **Hydration reminder**: every 90min during work hours if no log entry
- **Focus block end**: notify when a focus session timer expires

Implemented as a `NudgeScheduler` singleton using `croner` (lightweight cron library). Each nudge
rule is configurable on/off in `UserContext.nudges`. Nudges call the same tool layer as agents —
no special code paths.

---

## Phase 3 — New Capabilities

### 3.1 Document & File Intelligence

| Tool                    | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `extract_text_from_pdf` | `pdf-parse` → clean text (upload base64 or local path)         |
| `summarize_document`    | Chunk + map-reduce summarize a long document                   |
| `extract_tables`        | Detect and extract tabular data from documents/HTML            |
| `ocr_image`             | Tesseract OCR on a base64 image input (useful for screenshots) |
| `analyze_image`         | Pass image to vision model for description / object detection  |

### 3.2 Calendar Integration

> **Moved to Phase 1 / Sprint 1.** Calendar tools (`list_calendar_events`, `get_daily_agenda`,
> `create_calendar_event`, `find_free_time`) are now part of the TemporalAgent tool set — see
> section 1.1. CalDAV client scaffolding ships in the same sprint.

### 3.3 Multi-Modal Input

The `/chat/stream` endpoint already accepts `images` in its payload. Wire up a
`VisionPreprocessor` that, when an image is present:

1. Runs the image through a vision model for a plain-language description
2. Injects the description as a synthetic user context message before orchestration
3. Routes to the most appropriate agent (HomeAgent for home photos, FoodAgent for food photos, etc.)

### 3.4 Tool Result Caching

Add a `ToolCache` middleware layer in `ToolRegistry.execute()` that caches results by
`(toolName, paramsHash)` with configurable TTLs:

| Tool                  | TTL        |
| --------------------- | ---------- |
| `get_current_weather` | 10 minutes |
| `get_daily_forecast`  | 1 hour     |
| `get_exchange_rate`   | 15 minutes |
| `get_crypto_price`    | 5 minutes  |
| `wikipedia_lookup`    | 24 hours   |
| `get_news`            | 30 minutes |
| `get_recipe`          | 1 week     |

Cuts agentic latency significantly when the same tool is called multiple times within a
conversation or by the nudge scheduler.

### 3.5 Self-Improvement: Tool Usage Analytics

The `MetricsCollector` already tracks per-tool call counts and durations. Expose a
`GET /app-metrics/tool-ranking` endpoint that returns tools sorted by usage frequency. Use this to:

- Auto-prioritize which tools appear first in the orchestrator's routing prompt
- Surface unused tools for deprecation review
- Identify slowest tools that need caching or optimization

---

## Phase 4 — Integration Deepening

### 4.1 Recipes App Bridge

`apps/recipes` is in the monorepo. The FoodAgent tools call its REST API at
`RECIPES_API_URL` (env). The AI becomes a natural language front-end to a full recipe database.

### 4.2 Kanban App Bridge

`apps/kanban` is deployed. The ProductivityAgent tools call its REST API at `KANBAN_API_URL`.
This means the AI assistant literally creates, updates, and queries tasks in the same board the
user works in every day.

### 4.3 Finances App Bridge

`apps/finances` is deployed. The FinanceAgent tools call its REST API at `FINANCES_API_URL` for
transaction logging and budget queries.

### 4.4 ntfy Bridge

ntfy is deployed at `deployments/ntfy`. All notification tools call the ntfy HTTP API with the
user's configured topic. The AI can push to any device without extra setup.

---

## Implementation Roadmap

### Sprint 1 (Week 1–2): Temporal + Calendar + Weather + UserContext
- [ ] `src/app/mcp/tools/temporal-tools.ts` — 12 tools (8 temporal + 4 calendar)
- [ ] `src/app/mcp/tools/weather-tools.ts` — 11 tools (Open-Meteo)
- [ ] `src/app/context/user-context.ts` + `config/user-context.router.ts` (includes `calDavUrl/Username/Password`)
- [ ] `src/app/clients/open-meteo-client.ts`
- [ ] `src/app/clients/caldav-client.ts` — CalDAV PROPFIND (read) + PUT (write) wrappers using `ical.js`
- [ ] Register TemporalAgent + MeteorologistAgent in `orchestrator.ts`

### Sprint 2 (Week 3–4): Research + Utility Split + Parallel Fanout
- [ ] `src/app/mcp/tools/research-tools.ts` — 10 tools
- [ ] `src/app/mcp/tools/math-tools.ts` — 5 tools
- [ ] `src/app/mcp/tools/formatter-tools.ts` — 8 tools
- [ ] `src/app/mcp/tools/network-tools.ts` — 8 tools
- [ ] `src/app/mcp/tools/security-tools.ts` — 5 tools
- [ ] Remove old `system-tools.ts` generalist tools; keep only `ask_user` + `sensitive_action`
- [ ] Implement `delegate_to_agents` parallel fanout in `orchestrator.ts`
- [ ] `src/app/mcp/tool-cache.ts` — result caching with configurable TTLs
- [ ] Register ResearchAgent, MathAgent, FormatterAgent, NetworkAgent, SecurityAgent

### Sprint 3 (Week 5–6): Productivity + Finance
- [ ] `src/app/mcp/tools/productivity-tools.ts` — 12 tools
- [ ] `src/app/mcp/tools/finance-tools.ts` — 10 tools
- [ ] `src/app/clients/kanban-client.ts`
- [ ] Register ProductivityAgent, FinanceAgent

### Sprint 4 (Week 7–8): Health + Communication + Food
- [ ] `src/app/mcp/tools/health-tools.ts` — 21 tools (11 general + 10 Whoop)
- [ ] `src/app/mcp/tools/communication-tools.ts` — 7 tools
- [ ] `src/app/mcp/tools/food-tools.ts` — 10 tools
- [ ] `src/app/clients/ntfy-client.ts`
- [ ] `src/app/clients/recipes-client.ts`
- [ ] `src/app/clients/whoop-client.ts` — OAuth2 token store + typed wrappers for all 5 Whoop resource groups
- [ ] `src/app/config/whoop-auth.router.ts` — `GET /config/whoop/auth` (initiate), `GET /config/whoop/callback` (exchange + store token), `DELETE /config/whoop/auth` (revoke)
- [ ] Register HealthAgent, CommunicationAgent, FoodAgent

### Sprint 5 (Week 9–10): Proactive Nudges + Memory
- [ ] `src/app/nudges/nudge-scheduler.ts` + `nudge-rules.ts`
- [ ] `src/app/memory/memory-store.ts` — per-agent rolling memory
- [ ] Wire nudge scheduler to ntfy client

### Sprint 6 (Week 11–12): Model Tiers + Analytics
- [ ] Assign model tiers in all agent configs
- [ ] `GET /app-metrics/tool-ranking` endpoint
- [ ] Full API documentation update

---

## Target File Structure

```
src/app/
  agents/
    agent.ts                       ← (existing)
    orchestrator.ts                ← updated: parallel fanout, 12 sub-agents
    tool-router.ts                 ← updated: all new categories
    agents.router.ts               ← (existing, minor additions)
    index.ts                       ← updated: all 12 agent registrations
  context/
    user-context.ts                ← NEW: UserContext store + defaults
    user-context.router.ts         ← NEW: GET/PATCH /config/user-context
  memory/
    memory-store.ts                ← NEW: per-agent rolling memory
  nudges/
    nudge-scheduler.ts             ← NEW: croner-based proactive nudges
    nudge-rules.ts                 ← NEW: configurable rule definitions
  mcp/
    tool-cache.ts                  ← NEW: result caching middleware
    tool-registry.ts               ← updated: cache integration
    tools/
      index.ts                     ← updated: import all tool files
      system-tools.ts              ← trimmed: only ask_user + sensitive_action remain
      temporal-tools.ts            ← NEW: 12 tools (time + calendar)
      weather-tools.ts             ← NEW: 11 tools
      research-tools.ts            ← NEW: 10 tools
      productivity-tools.ts        ← NEW: 12 tools
      finance-tools.ts             ← NEW: 10 tools
      health-tools.ts              ← NEW: 21 tools (11 general + 10 Whoop)
      communication-tools.ts       ← NEW: 7 tools
      food-tools.ts                ← NEW: 10 tools
      math-tools.ts                ← NEW: 5 tools
      formatter-tools.ts           ← NEW: 8 tools
      network-tools.ts             ← NEW: 8 tools
      security-tools.ts            ← NEW: 5 tools
  clients/
    ntfy-client.ts                 ← NEW: ntfy HTTP client
    kanban-client.ts               ← NEW: Kanban API client
    recipes-client.ts              ← NEW: Recipes API client
    open-meteo-client.ts           ← NEW: Open-Meteo weather API client
    caldav-client.ts               ← NEW: CalDAV PROPFIND/PUT + ical.js parser (iCloud & Google)
    whoop-client.ts                ← NEW: Whoop OAuth2 token lifecycle + typed resource clients
  config/
    whoop-auth.router.ts           ← NEW: OAuth2 initiate / callback / revoke routes
```

---

## Tool Count Summary

| Domain        | Tools                      | Agent              |
| ------------- | -------------------------- | ------------------ |
| Temporal      | 12 (8 time + 4 calendar)   | TemporalAgent      |
| Weather       | 11                         | MeteorologistAgent |
| Research      | 10                         | ResearchAgent      |
| Productivity  | 12                         | ProductivityAgent  |
| Finance       | 10                         | FinanceAgent       |
| Health        | 21 (11 general + 10 Whoop) | HealthAgent        |
| Communication | 7                          | CommunicationAgent |
| Food          | 10                         | FoodAgent          |
| Math          | 5                          | MathAgent          |
| Formatter     | 8                          | FormatterAgent     |
| Network       | 8                          | NetworkAgent       |
| Security      | 5                          | SecurityAgent      |
| **Total**     | **119**                    | **12 agents**      |

---

## Design Principles

1. **Additive, not breaking** — all existing `/chat/stream` endpoints stay compatible. New agents
   appear transparently; the frontend needs no changes to benefit.

2. **Zero mandatory external accounts** — prefer free/open APIs (Open-Meteo, DuckDuckGo,
   Wikipedia, Open Food Facts, CoinGecko free tier, Open Library, Open Trivia DB). Paid APIs are
   optional env-var-gated upgrades.

3. **Approval gates for all writes** — any tool that modifies external state (kanban,
   finances, calendar, notifications) requires `approval.required: true`. The user stays in control.

4. **Fail gracefully** — every tool catches its own errors and returns `{ success: false, error }`
   rather than throwing. The agent continues with partial results.

5. **Latency matters** — tool result caching + parallel fanout + model tier selection all serve the
   goal of feeling instant. Target: sub-500ms for simple lookups, sub-3s for multi-agent synthesis.

6. **Observable by default** — every tool call surfaces as a stream event. The chat frontend
   renders tool call cards ("🌤 Fetching weather for Edmonton, AB...") so users always understand
   what the assistant is doing.

7. **Personal by default** — UserContext means the assistant never asks "what city?" twice. It
   knows your timezone, currency, working hours, and health goals. The more you use it, the more it
   anticipates rather than reacts.
