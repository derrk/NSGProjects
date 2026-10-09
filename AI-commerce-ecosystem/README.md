# AI Holding Company OS

One platform where every business is a division, every worker is a registered agent,
and every action that spends money or touches a customer lands in one approval inbox.

Division one is a print-on-demand store. The 3D print farm, card vending, an agency and
trading research are later divisions added through the same interface, not new projects.

The full design is in [SPEC.md](SPEC.md). This file is how to run it.

---

## Run it

You need [Node 24+](https://nodejs.org), [pnpm 11+](https://pnpm.io) and
[Docker Desktop](https://docker.com) running.

```bash
pnpm install
pnpm dev:db        # Postgres 17 + pgvector in Docker, on port 5433
pnpm seed          # migrations, then demo data
pnpm dev           # http://localhost:3000
```

That is the whole setup. **No API keys and no accounts are needed** — agents run against
offline stand-ins, and the complete demo workflow works without spending a cent.

To also run the scheduler and event-driven agents, in a second terminal:

```bash
npx --ignore-scripts=false inngest-cli@latest dev -u http://127.0.0.1:3000/api/inngest
```

Without it the app still works; "Run now" executes agents inline through the same code
path. What you lose is cron scheduling and automatic handoff between agents.

| Command | What it does |
| --- | --- |
| `pnpm dev:db` | Start the database (idempotent) |
| `pnpm dev:db:reset` | Destroy it and start clean |
| `pnpm seed` | Apply migrations and insert demo data |
| `pnpm dev` | Run the app |
| `pnpm test` | Run every test |
| `pnpm --filter @acf/web agent "<name>"` | Run one agent from the CLI |
| `pnpm --filter @acf/web new-division "<name>" [module]` | Create a division from the CLI |

---

## A five-minute walkthrough

1. **The Holding** (`/`) — the company on one screen: money, queue depths, every
   division. Type an idea into the Research desk and hand it to a division.
2. **Quarantine** (`/inbox`) — the one approval queue, across every division. The seed
   leaves design proposals here. Each shows three variants; pick one or burn all three.
   Watch the clearance counter move: a category earns auto-approval at 20 decisions and
   95% approval, 50 for designs.
3. **Outfits** (`/divisions`) — raise a second division from the `generic` blueprint. It
   appears with its own agents, its own approval rules and its own spend cap. Nothing in
   core changed to make that work.
4. **The Crew** (`/agents`) — every agent, its health, its editable orders. Hit **Run
   now** on Design bay and it takes the next waiting concept, produces three variants and
   files them in Quarantine.
5. **Treasury** (`/treasury`) — every ledger entry with its provenance: estimate,
   simulated, entered by hand, or verified. Nothing here is verified yet, and the screen
   says so rather than letting you assume.
6. **Archives** (`/archives`) — search everything that happened. Open a record to see the
   chain: input, runs, cost, approvals, what the agent chose to remember, and the event
   log. **Export Markdown** gives you an Obsidian-ready file.

To see the whole pipeline from a cold start:

```bash
pnpm dev:db:reset && pnpm seed
pnpm --filter @acf/web agent "Design bay"
```

---

## Architecture

```
apps/web                  Command center UI, API routes, webhooks
packages/core/db          Drizzle schema for the core tables, migrations, views
packages/core/runtime     Agent run loop, approval gate, health, module registry
packages/core/jobs        Inngest functions, adapters, archive, task execution
packages/core/integrations Typed clients: Anthropic, fal.ai, Supabase Storage
modules/pod               Division one: the print-on-demand store
modules/_template         Copy this to start a new division
```

### The tool catalog

Every agent's capabilities come from the `tools` array on its row, enforced in the
catalog rather than requested in a prompt. Granting a capability is a database change
the operator can see; the model cannot talk its way into one.

`db.query` is the one tool that runs model-authored SQL, and it has three independent
defences: it must parse as a single SELECT, it may only name an allowlist of views, and
it runs inside a `READ ONLY` transaction. The third holds even if the first two are
wrong.

`send_email` has no send path at all. It drafts and files for approval, because the most
reliable way to guarantee a human sees outbound mail is for the sending code not to
exist yet.

Three rules hold it together:

**Core never imports from `modules/`.** Core defines the module interface; `apps/web` is
the composition root where the two meet. That is what lets you delete a division.

**A module owns a Postgres schema, core owns none of its tables.** `pod.*` references
core rows by id; core never references `pod.*`. A test asserts no module table ever
appears in `public`.

**A task is the only unit of work.** An operator request, a schedule tick, a webhook and
an agent's subtask all become rows in `tasks`, which is why one generic runner serves
every division and adding a division adds no infrastructure.

### Adding a division

Copy `modules/_template`, rename it, declare your stations, approval kinds and agents in
`module.ts`, then add two lines to `apps/web/lib/modules.ts`. Create it from the UI at
`/divisions`. The registry seeds its agents and approval rules.

---

## Safety model

- **Every agent starts at `propose`.** Autonomy is earned per category, never granted.
- **The never-auto list outranks earned autonomy.** Refunds, purchases, contracts, price
  changes over 15%, anything flagged high IP risk, and any customer reply mentioning a
  lawyer, a chargeback, a wrong item or damage always reach a human — even in a category
  that has graduated.
- **Spend caps are enforced in the gate, not in a prompt.** A prompt is a request; this
  is a rule.
- **Auto-approvals do not count toward their own graduation.** Otherwise a category would
  hold its approval rate at 100% forever and could never be re-tested.
- **Retrieved pages and inbound messages are data, never instructions.**

### Costs are estimates unless stated otherwise

Everything in `agent_runs.cost_cents` and every API figure on the dashboard is **modelled
from a price table, not billed**. Verified spend would mean a provider invoice or an
imported transaction, and nothing here is that. The Markdown export carries this caveat
with it, because a number copied into someone's notes outlives the context around it.

### Demo data is fictional

The divisions, niches and concepts the seed inserts were written by hand to exercise the
pipeline. No revenue figure in this app has been earned.

---

## Known limitations

These are real gaps, not polish:

- **No authentication.** The inbox says so on the screen. Run it locally; do not deploy
  it to a public URL until operator sign-in lands.
- **Memory recall is recency and pinning, not similarity.** `embed_text` exists now,
  but the run loop does not yet embed memories on write, so `agent_memory.embedding`
  is still null and recall cannot rank by distance. Wiring those two together is the
  next small job.
- **Two core tools are offline stand-ins.** `web_search` returns results that say
  "SIMULATED" in the title until `TAVILY_API_KEY` is set, and `embed_text` uses a local
  lexical vectoriser that reports `semantic: false` — it captures shared vocabulary,
  not meaning. Both are honest about it in their own output.
- **Three of the four POD agents are seeded paused.** Store ops, Support and Trend scout
  are declared so their stations appear, with no runner behind them yet. The registry
  marks them "no runner yet" rather than pretending.
- **No Printify, Shopify, Gmail or Etsy integration.** Week 2 onward.
- **The factory floor is a list, not a map.** The station map and live event feed are a
  later milestone; the data behind them already exists in `events`.

### The next thing to build

Embed memories on write, so recall ranks by similarity instead of recency — the tool
and the column both exist, they are just not connected. After that, the Store ops agent
and the Printify client.

---

## Tests

```bash
pnpm test
```

Unit tests run against in-memory fakes. Anything whose correctness depends on real SQL —
the approval gate's partial unique index, atomic task claiming, the dashboard views,
the Designer end to end — runs against PGlite applying the actual generated migrations.

---

## Configuration

Copy [`.env.example`](.env.example). For local development `apps/web/.env.local` is
already set up by the quickstart above and needs no keys.

Secrets never go in the database. The `credentials` table maps a credential *name* to an
environment variable name, so an agent's prompt and its tool logs can reference
`printify_token` without the value ever entering a row, a prompt or an event.
