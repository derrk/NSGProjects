# AI Holding Company OS — Build Spec

Oct 8, 2026 · @Derrik Pollock

## Overview

Build a personal holding-company operating system: one platform where every business is a division, every worker is a registered agent, and every decision that spends money or touches a customer lands in one approval inbox. The print-on-demand store is division one, live with 60 products by 5 November 2026; the 3D print farm, card vending and grading, an agency, and trading research are later divisions added through the same interface, not new projects.

**The platform's job**

- Register divisions, agents, goals and tasks as data, not code
- Run agents on schedules or on events, with retries, cost accounting and memory
- Route every consequential action through an approval queue with graduated autonomy
- Keep one shared knowledge layer (customers, leads, listings, inventory, opportunities, ledger) that every division reads and writes
- Show the whole company on one screen: cash, revenue by division, active agents, queues, opportunities, alerts
- Let the operator add a division or an agent from the dashboard, and eventually by asking an agent to do it

**The thin-core rule**

Every core table and screen exists in week 1, but only with the columns and features the POD store needs that week. The agent registry is a table and a list page, not a visual builder. Memory is a table with an embedding column, not a retrieval framework. Self-expansion is a meta-agent on the roadmap, not in the first month. The foundation is right because the shapes are right, not because they are finished.

**What the operator does (twice daily, 15–20 minutes)**

- Clear the approval inbox across all divisions
- Read escalations and opportunity briefs; approve, shelve or redirect
- Drop new ideas into the research desk
- Scan the floor for red stations

**Constraints**

- One month to build, solo operator, Claude Code doing most of the coding
- Division one launches on Shopify + Printify; Etsy via Printify in week 4 if stable, with AI disclosure
- No automation of marketplaces whose terms prohibit it (Fiverr, Upwork, Facebook Marketplace); those are scout-and-draft only
- No autonomous trade execution is designed; trading is a research division

**Done means (5 November)**

- Core OS: divisions, agents, goals, tasks, approvals, events, ledger, memory tables live; registry and inbox UI working; one division created through the UI
- Division one: 60 products live, created by the pipeline; agents ran 7 days with zero manual restarts
- Operator session timed under 20 minutes from a single screen

## Platform architecture

Three core layers are built once; divisions plug in underneath and never modify them. A division is a folder of agents, tools and screens plus rows in the registry; the core knows nothing about mugs, filament or Pokémon cards.

&#91;embedded content: platform architecture · core OS and 5 divisions\]

Every arrow is the same contract: the core dispatches a division's agents, the agents write into the shared knowledge layer, and the command center reads only from the core, so a new division appears on the floor the moment it registers.

| Layer | Choice | Why |
| --- | --- | --- |
| App framework | Next.js 15 (App Router), TypeScript, Turborepo monorepo | UI, API routes and webhooks in one codebase; modules as workspace packages |
| Database | Postgres on Supabase with `pgvector`, Drizzle ORM | Hosted, cheap, realtime channel, embeddings without a second datastore |
| Job scheduler | Inngest | Cron + event-driven functions, retries, step memoization, per-agent schedules loaded from the registry |
| Agent runtime | Anthropic SDK; Sonnet for routine runs, Opus for ranking, escalations and research briefs | Tool use with forced structured output |
| Realtime UI | Supabase Realtime on `events` | Floor and counters update without polling |
| Auth | Supabase Auth, single operator now, roles table from day one | Adding a second user later is a row, not a refactor |
| Hosting | Vercel + Inngest Cloud + Supabase | \~$45/month before API usage |
| Secrets | Vercel env vars; a `credentials` table pointing at env keys by name | Agents never see secrets; tools resolve them |

**Repo layout**

```markdown
apps/web                 Command center UI, API routes, webhooks
packages/core/db         Drizzle schema for core tables, migrations, typed queries
packages/core/runtime    Agent runner, tool catalog, memory, approval gate, event log
packages/core/jobs       Inngest functions that load schedules from the registry
packages/core/ui         Station, inbox card, division page primitives
modules/pod              Division 1: agents/, tools/, schema/, screens/, module.ts
modules/<name>           Each later division, same shape
```

## Core data model

Thirteen core tables are the shared source of truth; every division reads and writes through them and adds its own tables only under its own schema (`pod.*`, `print.*`). All ids are UUIDs, all timestamps `timestamptz`, every row written by an agent carries `actor` (`agent:<id>` or `user:<id>`), and every core row except `users` and `modules` carries `division_id`.

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | `email`, `role` (`owner` / `operator` / `viewer`), `settings` (jsonb) | One row today; roles exist so a second user is a row, not a refactor |
| `modules` | `name`, `version`, `stations` (jsonb), `approval_kinds` (jsonb), `tool_names[]`, `enabled` | Written by each module's `module.ts` on boot; the floor and inbox are rendered from this |
| `divisions` | `name`, `module_id`, `type`, `status` (`planning` / `active` / `paused` / `closed`), `goal_summary`, `config` (jsonb), `pnl_month_cents` (view) | A division is one business; a module can back several divisions |
| `agents` | `division_id`, `name`, `description`, `purpose`, `module_agent_key`, `model`, `system_prompt`, `tools[]`, `schedule` (cron or event), `autonomy` (`propose` / `act_with_approval` / `auto`), `status`, `last_run_at` | First-class identity; the registry UI edits these rows |
| `goals` | `division_id`, `agent_id?`, `statement`, `metric`, `target`, `current`, `deadline`, `status` | Agents read their division's goals into every prompt |
| `tasks` | `division_id`, `agent_id?`, `parent_task_id?`, `title`, `input` (jsonb), `output` (jsonb), `status` (`queued` / `running` / `blocked` / `done` / `failed`), `priority`, `due_at`, `source` (`schedule` / `event` / `operator` / `agent`) | The universal work queue; agents can create subtasks |
| `agent_runs` | `agent_id`, `task_id`, `started_at`, `finished_at`, `status`, `tokens_in`, `tokens_out`, `cost_cents`, `tool_calls` (jsonb), `error` | One row per invocation; the agent's run history |
| `agent_memory` | `agent_id`, `division_id`, `kind` (`decision` / `result` / `lesson` / `fact`), `content`, `embedding` (vector 1536), `task_id?`, `importance` (0–1), `created_at` | Written after each run; top-k by embedding is injected into the next prompt |
| `approvals` | `division_id`, `kind`, `category`, `ref_table`, `ref_id`, `summary`, `payload` (jsonb), `decision` (`pending` / `approved` / `rejected` / `edited`), `edit_payload`, `decided_by`, `decided_at` | The one inbox; `kind` must be registered in `modules.approval_kinds` |
| `approval_rules` | `division_id`, `kind`, `category`, `approved_count`, `rejected_count`, `threshold_count` (default 20), `threshold_rate` (default 0.95), `auto_enabled`, `never_auto` | Graduated autonomy per division per category |
| `opportunities` | `division_id?`, `source`, `title`, `url`, `summary`, `est_profit_cents`, `confidence` (0–1), `risk` (`low` / `med` / `high`), `hours_required`, `score`, `status` (`new` / `reviewed` / `pursuing` / `shelved` / `done`), `evaluated_by` | Written by any scout agent in any division; scored by one shared formula |
| `entities` | `division_id`, `type` (`customer` / `lead` / `supplier` / `listing` / `inventory_item` / `asset`), `name`, `external_ids` (jsonb), `attributes` (jsonb), `embedding?` | Generic records so a new division has somewhere to write before it earns dedicated tables |
| `ledger` | `division_id`, `kind` (`revenue` / `cogs` / `expense` / `api_cost` / `asset` / `liability`), `amount_cents`, `occurred_at`, `source`, `ref_table`, `ref_id` | Append-only; revenue, cash flow and net worth are views over this |
| `events` | `division_id?`, `agent_id?`, `kind`, `level`, `message`, `ref_table`, `ref_id`, `ts` | Append-only; the floor subscribes to inserts; 90-day retention |

**Views the dashboard reads**

- `v_division_pnl` — revenue, cogs, expenses, api cost, margin per division per month
- `v_company_cash` — ledger rolled up: cash in, cash out, net, assets minus liabilities
- `v_agent_health` — last run, success rate over 7 days, cost over 7 days, stale flag
- `v_queue_depth` — pending approvals and queued tasks per division

**Module schemas**

A module owns a Postgres schema named after it. Its tables reference core rows by id (`pod.products.entity_id → entities.id`, `pod.designs.task_id → tasks.id`) but core never references module tables. That one rule is what keeps a division removable.

## Module interface

A division is added by dropping a folder in `modules/` that exports one `module.ts`; the core discovers it on boot, upserts its row in `modules`, and the floor, inbox, tool catalog and schedules update without touching core code.

```markdown
modules/pod/
  module.ts        name, version, stations, approvalKinds, agents, tools, screens, migrations
  agents/          one folder per agent: prompt.md, schema.ts, run.ts
  tools/           typed tool definitions registered into the shared catalog
  schema/          Drizzle tables in the `pod` schema
  screens/         optional division-specific pages mounted at /divisions/:id/<screen>
  fixtures/        recorded API responses so the division runs in dev with no spend
```

**What `module.ts` declares**

| Field | Shape | Used by |
| --- | --- | --- |
| `name`, `version`, `description` | strings | Registry, division creation picker |
| `stations[]` | `{key, label, agentKey, counterQuery}` | Factory floor renders one station per entry |
| `approvalKinds[]` | `{kind, label, cardComponent, neverAuto?}` | Inbox renders the right card; rules table seeds thresholds |
| `agents[]` | `{key, defaultName, purpose, defaultModel, defaultSchedule, defaultTools[], promptPath, run}` | Registry seeds `agents` rows when a division is created; the runtime calls `run` |
| `tools[]` | `{name, description, inputSchema, handler, cost?}` | Shared tool catalog; any agent in any division can be granted them |
| `screens[]` | `{path, component}` | Division page tabs |
| `migrations` | path | Applied under the module's schema |
| `onDivisionCreate(division, config)` | function | Creates external accounts/webhooks, seeds entities, writes the first tasks |

**Core tools every module gets for free**

`web_search`, `fetch_page`, `db.query` (read-only SQL against core views), `entities.*`, `opportunities.create`, `tasks.create`, `memory.recall`, `memory.write`, `ledger.post`, `requestApproval`, `notify_operator`, `send_email` (through the division's configured mailbox), `generate_image`, `embed_text`.

**Adding a division, today and later**

1. Now: create a folder from the `modules/_template` scaffold, fill `module.ts`, write agents and tools, run migrations, click "New division" in the dashboard, pick the module, fill its config form. The core seeds agents, goals and the first tasks.
2. Month 2: the same, but a Research desk brief precedes it, and the division config form is generated from the module's Zod schema.
3. Month 3+: a meta-agent with `create_division`, `create_agent`, `create_goal`, `create_tasks` and `propose_schema` tools proposes the module folder and registry rows; every call goes through the approval inbox, and the operator approves the plan before any code is scaffolded.

**Rules that keep the core reusable**

- Core never imports from `modules/`; discovery is by filesystem convention plus the `modules` table
- A module never writes to another module's schema; cross-division data goes through core tables
- A module cannot define a new approval decision type or bypass `requestApproval`
- Disabling a module hides its stations and pauses its agents; its data stays

## Agent framework

An agent is a row in `agents` plus a `run` function its module provides; everything about who it is, what it may do and how much it may decide lives in the row, so the operator can create, retune or retire an agent from the registry page without a deploy.

**Identity and goals**

- `name`, `description`, `purpose` are shown on its station and in every prompt it receives
- `division_id` scopes its data access: core tools filter by division unless the agent is granted `cross_division`
- Goals are injected at run time: the division's active goals plus any goal assigned to the agent directly, with current vs target values

**Memory**

- After every run the runtime asks the agent for up to 5 memory entries (`decision`, `result`, `lesson`, `fact`) with an importance score; they are embedded and stored in `agent_memory`
- Before every run the runtime recalls the top 8 entries by cosine similarity to the task input, plus the 3 most recent `lesson` entries regardless of similarity
- Operator can pin, edit or delete memories from the agent's page; pinned memories always load
- Run history (`agent_runs`) is the audit trail, not memory; memory is what the agent chose to keep

**Tools**

- `tools[]` on the row lists names from the shared catalog; the runtime builds the tool schema per run and refuses calls outside it
- Tools do all external I/O and resolve credentials by name from the `credentials` table; agents never see keys
- Every tool call is logged as an event with arguments (bodies over 2 KB truncated) and a cost estimate
- Catalog is populated by core tools plus every enabled module's tools, so a cards agent can use the POD module's `generate_image` if granted

**Autonomy levels**

| Level | Meaning | Default for |
| --- | --- | --- |
| `propose` | Can only create tasks, opportunities and approval requests | Every new agent |
| `act_with_approval` | Can call side-effect tools, but each call that matches a registered approval kind is held in the inbox | Agents after their first clean week |
| `auto` | Side effects run immediately for categories whose `approval_rules` row has graduated; everything else still held | Earned per category, never set by hand except for read-only agents |

The `never_auto` flag on a rule is absolute: refunds, price changes over 15%, purchases over a per-division cap, outbound messages mentioning legal threats or damages, and anything a module marks `neverAuto`.

**The run loop**

1. Load the agent row, division, goals, pinned and recalled memories, and the task
2. Assemble the prompt: company header, division context, goals, memories, task input, output schema
3. Call the model with the agent's tool set; loop on tool calls up to `max_steps` (default 12)
4. Validate the output against the module's Zod schema; a failure is one retry with the error shown
5. Write output to the task, memories to `agent_memory`, cost to `ledger` (`api_cost`), a terminal event, and any approval requests

**Creating an agent from the dashboard**

Pick a division, pick a module agent key (or `generic` for a prompt-only agent using core tools), name it, edit the prompt, tick tools, set a schedule and autonomy level. Save inserts the row; the orchestrator picks up the schedule on its next tick.

## Orchestrator, tasks and approvals

The orchestrator is a small set of generic Inngest functions that read the registry; no module ever defines a cron. Work enters as tasks, tasks are claimed by agents, side effects wait in approvals, and everything writes events.

**Core jobs**

| Job | Trigger | What it does |
| --- | --- | --- |
| `scheduler.tick` | cron every 5 min | Reads `agents.schedule`; for each due agent creates a task with `source = schedule` and emits `task.created` |
| `task.run` | event `task.created`, `task.retry` | Claims the task, runs the agent's loop, writes output; 3 retries with backoff on transient errors |
| `task.on-approval` | event `approval.decided` | Looks up the held task, resumes it with the decision and any edited payload |
| `health.heartbeat` | cron every 15 min | Marks agents stale (amber) at 2× their interval, red after 3 failures; emails the operator on red |
| `ledger.rollup` | cron 23:30 America/Chicago | Refreshes P&L views, posts the day's API spend, flags divisions over their spend cap |
| `memory.prune` | cron weekly | Drops memories below importance 0.2 older than 60 days; events older than 90 days |
| `webhook.ingest` | HTTP | Module webhooks (Shopify, Printify, Gmail, eBay) normalize into `task.created` or `entities` upserts |

**Task queue**

- A task is the only unit of work; an operator request, a schedule tick, a webhook and an agent's subtask all become tasks
- `blocked` means waiting on an approval or a parent; the inbox shows what is blocked and why
- Priority is an integer; the scheduler runs `operator` tasks first, then by priority, then age
- Agents can create subtasks for themselves or other agents in their division; cross-division tasks require `cross_division`

**Approval gate**

- `requestApproval({kind, category, refTable, refId, summary, payload})` writes an `approvals` row, marks the task `blocked`, emits `approval.requested`, and ends the run
- Decisions post from the inbox as `approved`, `rejected` or `edited` (with the edited payload); the task resumes with the decision in its input
- `approval_rules` counts decisions per `(division, kind, category)`; at 20 decisions and 95% approval the category graduates to auto; any rejection after graduation resets the counter and revokes auto for that category
- `never_auto` categories and the per-division spend cap are enforced in `requestApproval` itself, not in prompts

**Event log**

Events are plain rows with namespaced kinds (`task.created`, `agent.run_ok`, `approval.requested`, `pod.product_published`, `print.job_queued`). Module kinds carry the module prefix so the floor filters per station without parsing. The command center subscribes to inserts; nothing else reads events for logic.

**Operator control surface**

- Pause switch per division and for the whole company (`divisions.status = paused` stops the scheduler for its agents within one tick)
- Daily spend cap per division (default $25) and per API; breaching one pauses that division's agents and lights its stations amber
- "Run now" on any agent creates an `operator` task immediately

## Command center

One Next.js app, five screens, every one of them rendered from core tables and the module registry so a new division shows up without UI work. The space-factory theme stays: each division is a wing of the factory, each agent a station on the wing.

**Screens**

1. **Company** (`/`) — the holding-company dashboard. Top row: cash on hand, revenue this month, expenses this month, net (all from `v_company_cash` and `ledger`). Second row: active divisions with monthly P&L sparkline, active agents and their health, pending approvals, queued tasks, new opportunities. Alerts list: red stations, spend-cap breaches, escalations. This is the first thing the operator sees and the only screen that needs to exist for a non-ecommerce division to feel managed.
2. **Floor** (`/floor`) — the space factory. One wing per active division, laid out from `modules.stations`; each station shows status light, today's counter, last 3 events, and opens a drawer with run history, memory and a Run now button. Conveyor pulses fire on `approval.requested` and `*.approved` events. Division wings can be collapsed.
3. **Inbox** (`/inbox`) — one queue across divisions, grouped by division then kind; cards come from the module's `cardComponent`, with a generic JSON card as fallback for any kind without one. Keyboard `A` approve, `R` reject, `E` edit, `J`/`K` navigate, bulk select. Each card shows its category's graduation progress. Opportunity briefs and research-desk reports also land here with pursue / shelve / redirect actions.
4. **Divisions** (`/divisions`, `/divisions/:id`) — list and detail. Detail shows the division's goals with progress, agents, P&L, entities browser (customers, leads, inventory, listings), opportunities, and any module screens. "New division" opens the module picker and config form.
5. **Registry** (`/agents`, `/agents/:id`) — every agent across divisions: health, cost, autonomy level, schedule. Detail page edits the prompt, tools, schedule and autonomy, shows run history with tool calls, and lets the operator pin, edit or delete memories. "New agent" creates a row.

**Research desk** (a panel on Company and a station on the floor) — a text box where the operator drops an idea. It becomes a task for the Research desk agent (a core `generic` agent in the holding-company division), which searches, reads, estimates cost and effort, and returns a brief as an opportunity with a recommendation. The operator pursues it (spawns tasks or a new division plan) or shelves it.

**Realtime and state**

- Server components load snapshots; a client hook subscribes to `events` inserts and patches counters, lights and the inbox badge in place
- Animations are CSS transforms under 1.5 s and respect `prefers-reduced-motion`
- Station status is computed server-side by `health.heartbeat`; the client never guesses

**Daily session (target 15–20 minutes, twice a day)**

1. Company screen: any alert? Handle it
2. Inbox: clear approvals by division, send escalated replies, decide on opportunity briefs
3. Research desk: drop any new ideas
4. Done; everything else runs on schedule

**Auth and visual direction**

- Supabase Auth, magic link, one allowed email now, roles table ready for more
- Dark navy, thin cyan module edges, status lights as small filled circles, monospace numerals, one display face for wing and station names; contrast ≥ 4.5:1 on all text; mobile layout stacks wings so the inbox clears from a phone

## Module 1: print-on-demand store

The first division proves the core with zero fulfillment risk: Printify prints and ships, Shopify sells, and the module's four agents move a design from idea to live listing through three approval gates. Target is 60 products live by 5 November and 150 by Black Friday.

**Registration (`modules/pod/module.ts`)**

- Stations: Trend scout, Design bay, Listing dock, Support deck
- Approval kinds: `concept` (card: brief + why now), `design` (3-up image picker), `product` (mockup + editable copy and price), `reply` (customer message beside editable draft), `price_change`
- Tools: `printify.*` (blueprints, create product, mockups, publish, order status), `shopify.*` (products, orders, prices, webhooks), `fal.generate`, `fal.upscale`, `fal.remove_bg`, `vision.check_text`, `gmail.*`
- Schema `pod`: `niches`, `concepts`, `designs`, `products`, `orders`, `messages`, `replies`; products and customers also upsert into core `entities`, every sale and Printify charge posts to `ledger`
- `onDivisionCreate`: validates Printify and Shopify tokens, registers Shopify webhooks, seeds the pricing table, blueprint table and blocked-phrase list, creates the four agents at `propose` autonomy

**Agents**

| Agent | Schedule | Model | Does | Requests |
| --- | --- | --- | --- | --- |
| Trend scout | daily 06:00 | Sonnet search, Opus ranking | 6–10 seasonal gift searches, reads 5–8 pages, scores demand, competition, giftability and IP risk; writes niches and 8 concepts; also writes each niche to `opportunities` | `concept` approval |
| Designer | on `concept.approved` | Sonnet + fal.ai | 3 distinct prompts per concept; Ideogram 3 for text designs, Flux otherwise; verifies lettering, upscales keepers to 4500×5400 px at 300 dpi, removes background, stores PNGs | `design` approval |
| Store ops | on `design.approved`; hourly order sync | Sonnet | Title ≤ 140 chars, 3-paragraph description, 13 tags; blueprint and provider from the approved table; price = cost × 2.2 rounded to .99; creates Printify product and mockups; on approval publishes to Shopify and verifies live; flags production holds and 5-day shipping delays | `product` approval; `orders.issue` events |
| Support | every 30 min + Gmail push | Sonnet; Opus for complaints | Classifies intent, drafts replies from real order and tracking data; routine intents auto-send once graduated; refunds, complaints and custom requests always escalate with a suggested reply | `reply` approval |

**Integrations**

| Service | Used for | Notes |
| --- | --- | --- |
| Printify API v1 | Blueprints, providers, product create/publish, mockups, order status | 600 req/min; publish to Shopify through Printify; Etsy channel enabled in week 4 only |
| Shopify Admin API (GraphQL) | Products, orders, prices, `orders/create` and `orders/updated` webhooks, Shopify Inbox | Custom app on your own store |
| Gmail API | `support@` mailbox read/send | OAuth refresh token; Pub/Sub push; handled threads labelled `agent/handled` |
| fal.ai | Image generation, upscale, background removal | `ideogram/v3`, `flux-pro/v1.1`, `clarity-upscaler`, `birefnet`; store seeds |
| Tavily | Trend research | `search_depth: advanced`, 8 results per query |

Print areas to hard-code and verify against Printify blueprint data: apparel front 4500 × 5400 px; 11 oz mug 2700 × 1050 px; 15 oz mug 3300 × 1200 px.

**Compliance and guardrails specific to this module**

- Disclose AI-generated designs on product pages and the About page; on Etsy, mark AI as the production method per Etsy's Creativity Standards and operate it as one human-owned shop through Printify's integration, never a custom Etsy API app
- `blocked_phrases` seeded with common trademarked apparel phrases; no brands, characters, logos, celebrities, teams, lyrics or quotes in any concept; no "in the style of \[living artist\]"
- `design` graduation threshold is 50, not 20
- Support never promises delivery dates the tracking does not show; `never_auto` on refunds and any message mentioning a lawyer, chargeback, wrong or damaged item

**Launch economics (estimates, replace with ledger data after week 2)**

Margin after Printify cost at 2.2× pricing is roughly $6–10 on apparel and $4–6 on mugs; fixed costs at launch scale are about $110–245/month including API spend; break-even is about 25–35 orders a month.

## Four-week build plan

Core first, store second, polish third. The core adds about four days versus a store-only build; those days come out of factory-floor polish, not out of the 5 November launch.

&#91;embedded content: build timeline · 4 weeks, 3 milestones\]

Each week is one Claude Code sprint and its checklist is the acceptance test. The holiday cutoff is a placeholder until Printify publishes 2026 provider deadlines.

**Week 1 (9–15 Oct): core OS and the Designer agent**

- [ ] Turborepo scaffold, Supabase project with `pgvector`, Drizzle schema for all 13 core tables and views, migrations, seed script
- [ ] Module discovery and the `modules` registry; `modules/_template` scaffold; `modules/pod/module.ts` registering stations, approval kinds and agents
- [ ] Inngest: `scheduler.tick`, `task.run`, `task.on-approval`, `health.heartbeat`; the agent run loop with memory write/recall, cost accounting and Zod validation
- [ ] Core tools: `web_search`, `fetch_page`, `requestApproval`, `memory.*`, `tasks.create`, `ledger.post`, `generate_image`
- [ ] Auth (one email), Company screen with placeholder metrics, Inbox with the generic JSON card and the `design` picker card
- [ ] Designer agent end to end: concept row in → 3 PNGs in storage → `design` approval → decision recorded
- [ ] Printify and Shopify accounts, tokens in env, one product published by hand to learn the API shapes

* Acceptance: a division created through the UI; 10 hand-written concepts produce 30 designs the operator picks from in the inbox

**Week 2 (16–22 Oct): POD pipeline and the full inbox**

- [ ] Printify and Shopify tools; Gmail OAuth
- [ ] Store ops agent: copy, product creation, mockups, `product` approval, publish on approval, hourly order sync; sales and costs posting to `ledger`
- [ ] Inbox cards for `concept`, `product`, `reply`; keyboard shortcuts; bulk approve; graduation progress
- [ ] Divisions list and detail (goals, agents, P&L, entities browser)

* Acceptance: 20 products live on Shopify created by the pipeline; a test order flows to Printify and appears in the ledger

**Week 3 (23–29 Oct): floor, registry and Support**

- [ ] Factory floor rendered from `modules.stations`, station drawer with run history and memories, realtime feed, conveyor pulses
- [ ] Agent registry list and detail: edit prompt, tools, schedule, autonomy; pin/edit memories; New agent
- [ ] Support agent with intent classification, drafts from order data, auto-send once graduated; Shopify Inbox webhook
- [ ] Research desk agent and panel
- [ ] Store policy doc written and loaded

* Acceptance: a test support email gets a correct drafted reply within 30 minutes; a generic agent created from the registry runs on schedule

**Week 4 (30 Oct – 5 Nov): Scout, ledger views, hardening, launch**

- [ ] Trend scout with Tavily, writing niches to `opportunities`; Company dashboard on real ledger views
- [ ] Spend caps, pause switches, alert emails, memory prune, 7-day stability run
- [ ] Etsy channel via Printify if Shopify has been stable 5 days; AI disclosure in shop profile and listings
- [ ] Mockup quality pass, About page, SPEC.md updated with every decision made

* Acceptance: 60 products live; agents ran 7 days without a manual restart; operator session timed under 20 minutes

**After launch (Nov–Dec)**

- Scout runs daily; approve 5–10 concepts per session toward 150 products by Black Friday
- Pause products with zero views after 21 days; double down on niches with sales
- Start the Opportunity engine and 3D printing module scaffolds in December as the store runs itself

## Future divisions

Each outline below is what its `module.ts` would register plus the one or two things that make it different; each is a two-week add once the core exists. Order follows your priorities: the opportunity engine first because every later division uses it, then the print farm because it is the closest cousin of the store.

### Research desk (core, month 1)

- A `generic` agent in the holding-company division with `web_search`, `fetch_page`, `db.query`, `opportunities.create`, `tasks.create`
- Input: one idea from the operator. Output: a brief as an `opportunities` row with market summary, what exists, estimated cost and hours, confidence, a recommendation, and a proposed first three tasks
- Pursue spawns the tasks; "turn into a division plan" produces a draft `module.ts` outline and config for the operator to hand to Claude Code

### Opportunity engine (month 2)

- Not a division but a core capability: scout agents in any division write `opportunities`; one shared scoring formula ranks them; the Company screen shows the top 10
- Score = expected profit × confidence ÷ (hours required × risk weight), with per-division weights the operator can tune
- First sources: eBay Browse and Finding APIs (sold comps, live listings), TCGplayer and PriceCharting price history, estate-sale and auction listing pages that permit fetching, manual import (paste a URL and the evaluator agent prices it). Facebook Marketplace has no API and scraping violates its terms, so it is manual-import only
- Agents: Market scanner (scheduled searches against a watchlist of categories), Comps evaluator (prices one item against sold history), Deal alert (notifies when score crosses a threshold)

### 3D printing division (month 2–3)

- Stations: Product research, Listing, Production queue, Materials
- Approval kinds: `product_concept`, `listing`, `print_job_batch`, `material_order`
- Agents: Research (which printable products are selling, from the opportunity engine), Product (listing copy, photos, pricing from print time and filament cost), Operations (turns orders into a print queue ordered by due date and machine availability, estimates hours and grams per job, flags when a bestseller needs a second machine), Materials (tracks filament inventory in `entities`, requests reorders)
- Schema `print`: `models`, `print_jobs`, `machines`, `materials`
- Storefront reuses the POD module's Shopify tools; fulfillment is you, so the production queue is the operator's daily list
- Later integration: OctoPrint or Bambu Lab APIs for direct job dispatch and status, which becomes a tool, not a core change

### Card vending and grading division (month 3–4)

- Stations: Sourcing, Grading desk, Listing, Vault
- Approval kinds: `buy_lot` (with spend cap), `grading_submission`, `listing`, `price_adjust`
- Agents: Sourcing scout (eBay lots, auctions, local listings via manual import; scores against sold comps), Grading evaluator (from photos and set data, estimates grade and PSA/CGC value uplift versus fee and turnaround; recommends submit or sell raw), Listing agent (writes and prices listings across eBay and TCGplayer), Vault (inventory in `entities` with cost basis, location and status)
- Schema `cards`: `cards`, `lots`, `submissions`, `sales`
- Vending machines, if you go that route, are a `machines` table plus a restock task generator

### Agency division (month 3–4)

- Stations: Lead finder, Audit bay, Proposals, Follow-up
- Approval kinds: `outreach_message`, `proposal`, `contract`
- Agents: Lead finder (local businesses with weak sites or no reviews response, from search and directories), Auditor (site speed, SEO, accessibility, AI-readiness report), Proposal writer (scoped offer and price from a rate card), Follow-up (sequenced messages, every send approved until graduated)
- Scout-and-draft only on Fiverr, Upwork and similar: the agent finds and drafts, the operator sends from the platform

### Trade research division (any time; read-only)

- Stations: Watchlist, Morning brief, Signals, Risk
- Agents: Watchlist researcher (news, filings, earnings calendar for your tickers), Signal generator (rule-based and model-assisted setups written to `opportunities` with confidence and risk), Risk calculator (position size against a stated max-loss rule)
- Approval kinds: `signal_review` only. The division is designed through phase 3 of your staged plan (research, human approval, partial automation of research tasks). No order-execution tool is in the catalog, and the design does not reserve a place for one; this is a deliberate boundary, not a gap to fill later. Not financial advice: the system is a research assistant for your own decisions

### Self-expansion (month 3+)

- A Founder meta-agent in the holding-company division with `create_division`, `create_agent`, `create_goal`, `create_tasks`, `propose_schema`
- Every call is an approval; the first version only proposes (writes a plan the operator approves), then scaffolds `modules/<name>` from the template, then seeds registry rows
- Prerequisite: three divisions created by hand so the template captures what they share

**Sequencing**

| Horizon | Ships |
| --- | --- |
| 30 days (to 5 Nov) | Core OS; POD store live; Research desk; one division created through the UI |
| 60 days (to 5 Dec) | Opportunity engine with eBay and manual import; agent memory tuned on real runs; 3D printing module scaffold with product research and listing agents; 150 POD products |
| 90 days (to 5 Jan) | 3D printing production queue live; cards division sourcing and grading evaluator; agency lead finder and auditor; trade research watchlist; Founder meta-agent in proposal-only mode |

## Guardrails and costs

The platform fails quiet and safe: a stuck agent costs a day of output in one division, never money, a customer, or an account's standing. Module-specific rules live in each module section; these apply everywhere.

**Money**

- Every agent starts at `propose`; autonomy is earned per category, never granted wholesale
- Per-division daily spend cap (default $25) and per-API caps enforced in the tool layer; breaching one pauses the division's agents
- Purchases, refunds, price changes over 15%, and contracts are `never_auto` in every module
- No tool in the catalog executes trades, transfers funds, or enters payment credentials; those are operator-only, outside the system

**Platforms and people**

- No automation of marketplaces whose terms prohibit it: Fiverr, Upwork, Facebook Marketplace are scout-and-draft only; Etsy only through Printify's integration with AI disclosure
- Outbound messages to customers, leads or clients are approved per message until the category graduates, and never auto-sent when they mention legal threats, chargebacks, damages or disputes
- No cold outreach by email from the platform's mailboxes until the agency division has its own consented list and unsubscribe handling
- Customer and lead data stays in `entities` with `division_id`; agents cannot read another division's people without `cross_division`

**Content and IP**

- `blocked_phrases` and the no-brands/characters/lyrics/living-artist rules apply to every design-producing agent, not only the POD store
- Images, listings and proposals carry an AI-assisted disclosure where the platform or law requires it

**Operational**

- Pause-all stops every scheduler tick within 5 minutes; pause-division within one tick
- Secrets only in env; `credentials` table maps names to env keys; prompts and tool logs never contain secret values
- Every side effect is reconstructible from `events` plus `agent_runs`; retention 90 days
- Weekly review task for the operator: top rejected categories, cost per division, stale memories

**Estimated monthly cost** (core plus the POD store at launch scale; later divisions add API spend, not infrastructure)

| Item | Estimate |
| --- | --- |
| Vercel, Supabase, Inngest | $0–45 |
| Shopify Basic | \~$39 |
| Image generation (\~30/day) | $40–80 |
| Anthropic API (all agents, memory embeddings) | $40–80 |
| Tavily and eBay APIs | $0–20 |
| Total before product cost | \~$120–265 |

## Open questions and handoff

**Open questions to settle before week 1**

- [ ] Shop name, domain, and the one support email address
- [ ] Product set for launch: mugs, tees, sweatshirts, hoodies only, or add tote bags and posters?
- [ ] Pricing table: fixed 2.2× cost or per-product-type targets?
- [ ] Which print providers (US-only for faster holiday shipping is the safe choice)
- [ ] Shopify Inbox or email only for customer messages at launch
- [ ] Verify Printify's 2026 holiday order deadlines and set the `cutoff` milestone

**How to hand this to Claude Code**

Export this doc as Markdown into the repo as `SPEC.md`, then start each sprint with: "Read SPEC.md. We are in week N. Implement the week N checklist, one item per commit, writing tests for the agent run wrapper and the approval gate first." Keep `SPEC.md` updated as decisions are made; it is the contract between you and the agents.
