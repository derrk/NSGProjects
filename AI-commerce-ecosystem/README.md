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
pnpm seed:pet      # optional: the pet division, with fictional orders and margins
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
| `pnpm seed:pet` | Add the pet division: 2 products, 2 orders, fictional margins |
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
6. **Supply Lines** (`/supply`) — which integrations are `live`, which are `demo`, and
   which are `manual` because no agent can do them. Out of the box nothing is live, and
   the screen says so in the first line rather than letting you assume otherwise.
7. **Dry Run** (`/dry-run`) — the whole commerce pipeline end to end on demo adapters:
   research, channel review, supplier quote, draft, approval, publish, order, routing,
   fulfilment, tracking, support draft, margin report. Twelve steps, nothing real
   touched. Rendered by calling the same function the tests assert against, so it cannot
   keep showing a green screen after the pipeline behind it breaks.
8. **Archives** (`/archives`) — search everything that happened. Open a record to see the
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
packages/core/integrations Typed clients: Anthropic, fal.ai, Supabase Storage, Printify,
                          and the Etsy/Shopify/dropship channel adapters
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

## Selling on Etsy and Shopify

The two channels do different jobs, and the split is a platform rule rather than a
preference.

**Etsy** takes original and buyer-personalised work. Ordinary resale of a supplier's
catalogue item is not a grey area there — it is the thing the policy exists to stop, and
it closes shops rather than warning them. `checkListing` refuses a dropshipped listing
before it is drafted, and the demo adapter refuses it again at the transport layer,
because Etsy's own API would accept it and act on the shop later.

**Shopify** takes the practical goods: your own store, your own rules, resale fine.

Three things hold across both:

**Publishing requires an approval id as a required argument.** Not a prompt instruction —
an argument. An agent cannot talk its way past a function signature.

**A drafted listing has no URL.** Null, not a plausible `etsy.com` link. A fabricated URL
is the most likely way anyone comes to believe a listing is live when nothing exists.

**A quote is not an invoice.** `quote()` always returns `estimated`; only placing an
order returns `verified`. Every margin figure carries which it was built from, and a
mixed SKU reports at its weakest input. A dropship margin model built on quotes alone
reads healthy right up until the first month's statement.

### What only you can do

Supply Lines (`/supply`) lists these and links straight to them. No agent can do any of
it, and none of it is stored here:

- Open the Etsy shop; complete identity verification and bank details in Etsy's own flow
- Register your production partner on Etsy before any print-on-demand listing goes up
- Create the Shopify store, pick a plan, create a custom app for its Admin token
- Connect Printify to the storefront
- Choose and approve a dropship supplier, and order samples before anything goes live
- Settle sales tax and business registration

Government IDs, bank details and card numbers never enter this system. They go through
each platform's own flow, which is both the safe answer and the only one that works.

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
- **Memory similarity is lexical, not semantic.** Memories are embedded on write and
  recall ranks by pgvector cosine distance, so it is real similarity search — but the
  default provider matches shared vocabulary, not meaning. Two differently-worded
  descriptions of the same thing will not look alike. Swapping in a real embedding
  provider is one adapter, plus `backfillMemoryEmbeddings` to re-vector what exists
  (vectors from different models are not comparable).
- **Two core tools are offline stand-ins.** `web_search` returns results that say
  "SIMULATED" in the title until `TAVILY_API_KEY` is set, and `embed_text` uses a local
  lexical vectoriser that reports `semantic: false` — it captures shared vocabulary,
  not meaning. Both are honest about it in their own output.
- **Four of six POD agents are seeded paused.** The Designer and Store ops have runners.
  The Trend scout, Support deck, Supply scout and Counting house are declared so their
  stations appear, and each already has its decision logic built and tested — the
  support grounding checks, the supplier scoring, the finance report. What is missing is
  the model wiring, not the judgement. The registry marks them "no runner yet" rather
  than pretending.
- **No live Etsy or Shopify adapter.** Both have demo adapters that enforce the real
  constraints — Etsy's title, tag and personalisation limits, its refusal of ordinary
  resale, Shopify's handle collisions and empty stock — and both refuse to publish
  without a cited approval id. Neither reaches the platform, and a token in the
  environment does not change that. Supply Lines reports them as `demo`, never `live`.
- **No Gmail integration, by design rather than by backlog.** `send_email` has no send
  path. Nothing has ever been sent from this system.
- **The factory floor is a list, not a map.** The station map and live event feed are a
  later milestone; the data behind them already exists in `events`.

### The next thing to build

The live Etsy channel adapter. Everything upstream of it is finished and tested — the
compliance gate, the listing draft, the approval requirement, the order ingest, the
margin maths. What is missing is the HTTP client that turns a drafted listing into a
real one, and the owner-side setup on Supply Lines that has to happen first.

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
