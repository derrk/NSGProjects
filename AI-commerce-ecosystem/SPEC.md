# AI Commerce Factory — Build Spec

Oct 8, 2026 · @Derrik Pollock

## Overview

Build a print-on-demand store run by AI agents, live with 60+ listings by 5 November 2026, so the operator spends 15–20 minutes twice a day approving work instead of doing it. The target is Christmas gift buyers; Printify handles printing and shipping, so "fulfillment" from the operator's side means clearing the approval queue and escalated support, not packing boxes.

**What the system does on its own**

- Finds niches, generates designs, mockups, titles, tags and descriptions
- Publishes approved products to the store and keeps inventory/pricing in sync
- Reads customer messages and sends routine replies (shipping ETA, sizing, tracking)
- Monitors orders, flags Printify production problems, tracks revenue and ad-free margin

**What the operator does (twice daily, from the command center)**

- Approve or reject proposed designs and listings (batch, one click each)
- Answer escalated support (refunds, complaints, custom requests)
- Glance at the station board for red lights, resolve the ones the agents could not

**Constraints that shape the design**

- One month to build, solo operator, Claude Code doing most of the coding
- Launch channel is Shopify + Printify. Etsy is added through Printify in week 4 only if the Shopify pipeline is stable, and the Etsy shop must disclose AI-generated designs and be operated as one human-owned shop
- Fiverr/Upwork automation is out of scope (no API, bots violate their terms)
- Every action that spends money, publishes publicly or messages a customer goes through the approval queue until its category has a 95% approval rate over 20 items, then it auto-runs

**Done means**

- 60 live products across mugs, tees, sweatshirts and hoodies before 5 Nov
- Agents run on schedule for 7 days with zero manual restarts
- Operator session under 20 minutes with everything reachable from the command center
- First organic sale (goal, not a build criterion)

## Architecture and tech stack

One monorepo, one Postgres database, one scheduler. Agents are stateless functions that read and write the database; nothing important lives in an agent's memory.

&#91;embedded content: system architecture · 4 tiers\]

Arrows run top-down: the command center only talks to the orchestrator, the orchestrator dispatches agents, and each agent owns exactly one set of external services.

| Layer | Choice | Why |
| --- | --- | --- |
| App framework | Next.js 15 (App Router), TypeScript | One codebase for UI, API routes and webhooks |
| Database | Postgres on Supabase, Drizzle ORM | Hosted, cheap, realtime channel for the UI feed |
| Job scheduler | Inngest | Cron + event-driven functions, retries, step memoization, local dev server; no infra to run |
| Agent runtime | Anthropic SDK, `claude-sonnet-4-6` for routine runs, `claude-opus-4-6` for design concepting and escalations | Tool use + structured JSON output |
| Image generation | fal.ai (Flux for illustration, Ideogram 3 for text-heavy designs) | Reliable lettering, 300 dpi upscales |
| Print-on-demand | Printify API v1 | Mockups, product creation, order status, Shopify and Etsy publishing |
| Storefront | Shopify (Basic plan) | Open Admin API, Inbox for messages, no listing-bot risk |
| Email | Gmail API (OAuth) + Shopify Inbox webhook | One `support@` mailbox the Support agent owns |
| Web search | Tavily API | Trend scout research |
| Realtime UI | Supabase Realtime on the `events` table | Station board updates without polling |
| Hosting | Vercel (app) + Inngest Cloud + Supabase | \~$45/month before API usage |
| Secrets | Vercel env vars, never committed | Printify, Shopify, fal, Anthropic, Gmail refresh token |

**Repo layout**

```markdown
apps/web            Next.js app: command center UI + API routes + webhooks
packages/db         Drizzle schema, migrations, typed queries
packages/agents     One folder per agent: prompt.md, tools.ts, run.ts, schema.ts
packages/integrations  printify/, shopify/, fal/, gmail/, tavily/ thin typed clients
packages/jobs       Inngest functions (crons, event handlers)
```

## Data model

Ten tables carry the whole system; the `events` table is the source of truth for the command center and the audit trail. All ids are UUIDs, all timestamps are `timestamptz`, and every row that an agent wrote carries `created_by` (`agent:<name>` or `operator`).

| Table | Key columns | Notes |
| --- | --- | --- |
| `niches` | `name`, `keywords[]`, `audience`, `season`, `score` (0–100), `rationale`, `status` (`proposed` / `approved` / `rejected` / `exhausted`), `source_urls[]` | Written by Trend scout; a niche yields many concepts |
| `concepts` | `niche_id`, `title`, `prompt_brief`, `style`, `products[]` (mug, tee, sweatshirt, hoodie), `ip_risk` (`low` / `medium` / `high`), `ip_notes`, `status` | One concept = one design idea; approval gate #1 |
| `designs` | `concept_id`, `image_url` (Supabase storage), `source_model`, `gen_prompt`, `seed`, `width`, `height`, `dpi`, `variant_no`, `status` | 3 variants per concept; operator picks one or rejects all |
| `products` | `design_id`, `printify_product_id`, `shopify_product_id`, `etsy_listing_id`, `blueprint_id`, `print_provider_id`, `title`, `description`, `tags[]`, `price_cents`, `cost_cents`, `status` (`draft` / `pending_approval` / `published` / `paused` / `retired`), `published_at` | Approval gate #2; one row per design × product type |
| `orders` | `shopify_order_id`, `printify_order_id`, `customer_email`, `total_cents`, `cost_cents`, `status` (`received` / `in_production` / `shipped` / `delivered` / `issue` / `refunded`), `tracking_url`, `issue_notes` | Synced hourly from both APIs; `issue` lights the station red |
| `messages` | `channel` (`gmail` / `shopify_inbox`), `external_id`, `thread_id`, `from_email`, `subject`, `body`, `order_id?`, `intent` (`shipping_eta` / `sizing` / `tracking` / `refund` / `complaint` / `custom` / `other`), `status` (`new` / `drafted` / `sent` / `escalated` / `closed`) | Inbound mail; intent set by Support agent |
| `replies` | `message_id`, `body`, `auto_sent` (bool), `status` (`pending_approval` / `sent` / `rejected`), `sent_at` | Approval gate #3 |
| `approvals` | `kind` (`concept` / `design` / `product` / `reply` / `price_change`), `ref_id`, `summary`, `payload` (jsonb), `decision` (`pending` / `approved` / `rejected` / `edited`), `decided_at`, `edit_payload` | The single inbox the operator works |
| `approval_rules` | `kind`, `category`, `approved_count`, `rejected_count`, `auto_enabled` (bool), `threshold` (default 20 items at 95%) | Drives graduated autonomy |
| `agent_runs` | `agent`, `trigger` (`cron` / `event` / `manual`), `started_at`, `finished_at`, `status` (`running` / `ok` / `error`), `input` (jsonb), `output` (jsonb), `tokens_in`, `tokens_out`, `cost_cents`, `error` | One row per agent invocation |
| `events` | `ts`, `agent`, `kind`, `level` (`info` / `warn` / `error`), `message`, `ref_table`, `ref_id` | Append-only; command center subscribes to this |
| `daily_metrics` | `date`, `revenue_cents`, `cogs_cents`, `orders`, `products_live`, `designs_generated`, `messages_handled`, `api_cost_cents` | Finance agent rolls this up nightly |

**Status machines worth enforcing in code** (not just documentation)

- `concepts`: proposed → approved → (designs generated) → done; proposed → rejected
- `products`: draft → pending\_approval → published → paused / retired; pending\_approval → rejected
- `messages`: new → drafted → sent; new → escalated → closed

Supabase Storage holds design PNGs at `designs/<concept_id>/<variant_no>.png`; mockups are fetched from Printify on demand and cached at `mockups/<product_id>/<view>.jpg`.

## Orchestrator

The orchestrator is a set of Inngest functions plus three conventions: every agent run is a job with retries, every side effect goes through the approval gate, and every state change writes an event. Nothing calls an agent directly from the UI; the UI emits an Inngest event and the job runs.

**Schedule (all times America/Chicago)**

| Job | Trigger | What it does |
| --- | --- | --- |
| `scout.daily` | cron 06:00 | Trend scout proposes 8 concepts across 2–3 niches; creates `approvals` of kind `concept` |
| `designer.on-concept-approved` | event `concept.approved` | Generates 3 variants, uploads to storage, creates `approvals` of kind `design` |
| `store.on-design-approved` | event `design.approved` | Builds listing copy for each product type, creates Printify products as drafts, creates `approvals` of kind `product` |
| `store.on-product-approved` | event `product.approved` | Publishes to Shopify via Printify, verifies the product is live, sets `published_at` |
| `orders.sync` | cron every hour | Pulls Shopify orders + Printify order status, updates `orders`, emits `order.issue` on production holds or shipping delays over 5 days |
| `support.inbox` | cron every 30 min + Gmail push | Ingests new mail, classifies intent, drafts a reply; auto-sends if the rule allows, else creates `approvals` of kind `reply` |
| `finance.nightly` | cron 23:30 | Rolls up `daily_metrics`, computes margin per product, pauses products with negative margin, posts a one-line summary event |
| `health.heartbeat` | cron every 15 min | Marks any agent whose last run is older than 2× its interval as `stale` (station goes amber); 3 consecutive failures → red + email to operator |

**Approval gate**

- `requestApproval({kind, refId, summary, payload})` is the only way an agent proposes a side effect. It writes an `approvals` row, emits `approval.requested`, and the job ends.
- `GET /api/approvals?status=pending` feeds the inbox. Decisions post back as `approved`, `rejected` or `edited` (with the edited payload), which emits `<kind>.approved` and resumes the pipeline.
- `approval_rules` tracks counts per `(kind, category)`. When a category has ≥ 20 decisions and a ≥ 95% approval rate, the orchestrator sets `auto_enabled = true` and skips the inbox for that category. Any rejection after auto-enable resets the counter and disables auto for that category. Categories: concept niche type, reply intent, product type.
- Hard-coded never-auto list: refunds, price changes above 15%, any reply containing a promise about delivery dates in December, anything tagged `ip_risk = high`.

**Agent run contract**

Each agent exports `run(input, ctx): Promise<output>` where `ctx` gives it `db`, `tools`, `log(event)` and `requestApproval`. The orchestrator wraps every run: inserts an `agent_runs` row, retries up to 3 times with backoff on transient errors, records token usage and cost, and writes a terminal event. Agents return structured JSON validated with Zod; a validation failure is a retry, not a crash.

**Event log**

Events are plain rows: `{ts, agent, kind, level, message, ref_table, ref_id}`. The command center subscribes to inserts over Supabase Realtime. Kinds are namespaced (`scout.proposed`, `designer.generated`, `store.published`, `support.sent`, `orders.issue`, `health.stale`), so the station board can filter per agent without parsing messages. Retention: 90 days, then nightly prune.

## Agents

Five agents, each a folder in `packages/agents/<name>/` with `prompt.md` (system prompt), `tools.ts` (typed tool definitions), `schema.ts` (Zod output) and `run.ts`. Prompts live as files so the operator can edit them from the command center's settings page without a deploy.

### Trend scout

- **Model:** Sonnet for search passes, Opus for the final ranking
- **Input:** today's date, list of niches already in the DB (so it does not repeat), product types available, holiday calendar
- **Tools:** `web_search(query)`, `fetch_page(url)`, `list_existing_niches()`, `get_sales_by_niche()`
- **Process:** 6–10 searches on seasonal gift queries ("gifts for nurses 2026", "funny christmas mug ideas", "\[hobby\] gift"), reads 5–8 pages, scores candidates on demand signal, competition, giftability and IP safety. Returns 2–3 niches and 8 concepts.
- **Output per concept:** `title`, `niche`, `prompt_brief` (what the image should show, in 2–3 sentences), `style` (one of: flat-vector, hand-lettered, retro-badge, line-art, watercolor), `products[]`, `audience`, `ip_risk` with notes, `why_now`
- **Guardrails:** reject any concept referencing a brand, character, team, celebrity, song lyric or movie quote. Reject phrases that are known registered trademarks on apparel (maintain a `blocked_phrases` list the operator can add to).

### Designer

- **Model:** Sonnet for prompt engineering; fal.ai for the image
- **Input:** one approved concept
- **Tools:** `generate_image(model, prompt, width, height, seed)`, `upscale(image_url)`, `remove_background(image_url)`, `check_text_rendering(image_url, expected_text)` (vision call that verifies lettering matches), `upload_to_storage(bytes, path)`
- **Process:** writes 3 distinct generation prompts from the brief (varying composition, not just colors). Uses Ideogram 3 when the concept has text, Flux otherwise. Generates at 1024², verifies text, upscales the keepers to 4500×5400 px (apparel print area at 300 dpi), removes background, stores PNGs. Requests `design` approval with all 3 variants side by side.
- **Output:** 3 `designs` rows with `gen_prompt`, `seed`, `image_url`
- **Guardrails:** if text verification fails twice, regenerate with a simplified phrase; if it fails three times, mark the concept `needs_human` instead of shipping a misspelled design.

### Store ops

- **Model:** Sonnet
- **Input:** one approved design + product types + the shop's pricing table
- **Tools:** `printify.list_blueprints()`, `printify.create_product(blueprint, provider, print_areas, variants, title, description, tags)`, `printify.get_mockups(product_id)`, `printify.publish(product_id, channel)`, `shopify.get_product(id)`, `shopify.update_price(variant_id, price)`, `get_pricing_table()`
- **Process:** writes a title (≤ 140 chars, keyword first), a 3-paragraph description (gift framing, material facts from the blueprint, care/shipping line), 13 tags; picks the blueprint and print provider from a fixed, operator-approved table (e.g. Bella+Canvas 3001 tee from a US provider, 11 oz and 15 oz mugs, Gildan 18000 sweatshirt, Gildan 18500 hoodie); sets price from the pricing table (cost × 2.2, rounded to .99); creates the Printify product; pulls mockups; requests `product` approval with mockups and copy.
- **On approval:** publishes to Shopify, verifies the product is live and the images loaded, writes `published_at`.
- **Order monitoring (hourly):** compares Shopify and Printify order status; emits `orders.issue` when Printify shows `on-hold`, `canceled` or no shipment after 5 business days.

### Support

- **Model:** Sonnet for classification and routine drafts, Opus for complaints and refund drafts
- **Input:** one inbound message + its thread + matched order (by email or order number) + the shop's policy doc
- **Tools:** `get_order(order_id)`, `get_tracking(order_id)`, `get_policy(topic)`, `search_messages(email)`, `draft_reply(body)`, `send_reply(reply_id)`, `escalate(message_id, reason)`
- **Process:** classifies intent. Routine intents (`shipping_eta`, `tracking`, `sizing`, `other` with a clear answer in the policy doc) get a drafted reply citing the real order data. `refund`, `complaint` and `custom` always escalate with a suggested reply attached so the operator edits and sends in one click.
- **Auto-send rule:** only intents whose `approval_rules` row has `auto_enabled`, and never a message that mentions a lawyer, a chargeback, a wrong item, or a damaged item.
- **Tone file:** `packages/agents/support/voice.md` — friendly, two short paragraphs max, sign-off with the shop name, no emoji

### Finance

- **Model:** none for the rollup (pure SQL); Sonnet writes the nightly one-paragraph summary
- **Process:** sums Shopify revenue, Printify cost, fal/Anthropic API spend from `agent_runs`, and writes `daily_metrics`. Flags products with no sales after 21 days as `stale` candidates and any product whose margin dropped below 25% (Printify price changes) for a price-change approval.

**Shared prompt conventions**

- Every system prompt opens with the shop's name, audience, and the date, and ends with the JSON schema the agent must return
- Agents never see API keys; tools do the calls
- Every tool call is logged as an event with its arguments (minus bodies over 2 KB) so the command center can show what an agent actually did

## External integrations

Each integration is a thin typed client in `packages/integrations/<name>/` with one function per API call, a shared retry/backoff wrapper, and a `mock.ts` that returns recorded fixtures so the pipeline runs end to end in dev without spending money.

| Service | Used for | Auth | Notes for the build |
| --- | --- | --- | --- |
| Printify API v1 | Blueprints, print providers, product create/publish, mockups, order status | Personal access token | Rate limit is 600 req/min; batch product creation. Publishing to a connected Shopify store is `POST /shops/{id}/products/{id}/publish.json`. Printify's Etsy channel is enabled in week 4 only. |
| Shopify Admin API (GraphQL) | Read products and orders, update prices, register webhooks (`orders/create`, `orders/updated`) | Custom app, Admin API access token | Printify owns product creation; Store ops only reads back and adjusts prices. |
| Shopify Inbox | Customer chat/messages | Via Shopify webhooks | Messages ingest into the same `messages` table as email. |
| Gmail API | `support@` mailbox read/send | OAuth 2 refresh token for one Google account | Use Pub/Sub push for near-real-time ingest; label handled threads `agent/handled`. |
| fal.ai | Image generation, upscaling, background removal | API key | Models: `fal-ai/ideogram/v3` for text designs, `fal-ai/flux-pro/v1.1` for illustrative, `fal-ai/clarity-upscaler` or `aura-sr`, `fal-ai/birefnet` for background removal. Store the seed for reproducibility. |
| Anthropic API | All agent reasoning | API key | Use tool use with `tool_choice` forced on the final structured output; set `max_tokens` per agent; log usage on every call. |
| Tavily | Trend research | API key | `search_depth: advanced`, limit 8 results per query. |
| Supabase | Postgres, storage, realtime | Service role key server-side only | Row-level security off for the service role; the UI reads through API routes, never directly. |

**Webhooks the app must expose** (`apps/web/app/api/webhooks/*`)

- `POST /api/webhooks/shopify/orders` — HMAC-verified; upserts `orders`, emits `order.received`
- `POST /api/webhooks/gmail` — Pub/Sub push; emits `support.message_received`
- `POST /api/webhooks/printify` — order status changes; emits `order.updated`
- `POST /api/inngest` — Inngest serve endpoint

**Print area specs to hard-code** (verify against Printify blueprint data at build time)

- Apparel front: 4500 × 5400 px, 300 dpi, PNG with transparency
- 11 oz mug wrap: 2700 × 1050 px; 15 oz: 3300 × 1200 px
- All designs are also saved at 1024² for the UI thumbnails

## Command center UI

The command center is one Next.js app with four screens; the operator's twice-daily session should never need a fifth. It is themed as a space factory, but every element maps to a real table or action, so the theme can be swapped without touching data.

**Screens**

1. **Factory floor** (`/`) — the home screen. An SVG floor plan with one station per agent (Scout, Design bay, Listing dock, Support deck, Finance core) connected by conveyor lines. Each station shows a status light (green running / idle, amber stale, red error), today's counter ("12 concepts", "3 published"), and its last 3 events on hover. Items visibly travel along the conveyors when an `approval.requested` or `*.approved` event fires. A top bar shows revenue today, orders in production, pending approvals, and API spend today.
2. **Inbox** (`/inbox`) — the approval queue, grouped by kind. Concepts render as cards with the brief and `why_now`; designs as a 3-up image picker; products as mockup + editable title/description/tags/price; replies as the customer message on the left and the editable draft on the right. Keyboard: `A` approve, `R` reject, `E` edit, `J`/`K` next/previous. Bulk approve selected. Each card shows the current auto-approval progress for its category ("17 / 20 approved, 100%").
3. **Orders** (`/orders`) — table of orders with status, production ETA, tracking link, and an issue flag. Issue rows expand to show the Printify status and a "Message customer" button that opens a pre-drafted reply.
4. **Settings** (`/settings`) — editable agent prompts (`prompt.md` files), pricing table, blocked phrases, approval rules with manual enable/disable per category, API spend caps per day, and a "pause all agents" switch.

**Station component spec**

- Props: `agent`, `status`, `lastRunAt`, `todayCount`, `recentEvents[]`
- Status derived server-side by `health.heartbeat`, never guessed by the client
- Click → drawer with the agent's run history (`agent_runs`), each run expandable to its tool calls and output JSON, and a "Run now" button that emits the agent's manual trigger event

**Realtime**

- Server component loads the initial snapshot; a client hook subscribes to `events` inserts via Supabase Realtime and patches station state and counters in place
- Conveyor animations are driven by event kinds, not polling; animations are CSS transforms, under 1.5 s, respecting `prefers-reduced-motion`

**Daily session flow (target: 15–20 minutes, twice a day)**

1. Open factory floor; any red station → open its drawer, read the error, hit Run now or fix the config
2. Open inbox: approve/reject concepts (2 min), pick designs (5 min), approve listings with any copy edits (5 min), send escalated replies (3 min)
3. Glance at orders for issue flags; message customers if needed
4. Close. Everything else runs on schedule

**Auth and access**

- Single operator: Supabase Auth with one allowed email, magic link login, session cookie
- All API routes check the session; webhooks check signatures instead

**Visual direction**

- Dark navy background, stations as rounded modules with thin cyan edges, status lights as small filled circles, monospace numerals for counters, one display typeface for station names
- Keep it legible first: no glow effects on text, contrast ratio ≥ 4.5:1 for all labels
- Mobile layout stacks the stations vertically so the inbox can be cleared from a phone

## API endpoints

All routes live under `apps/web/app/api/`, return JSON, and require the operator session except the webhooks. Mutations emit an Inngest event rather than doing the work inline, so the UI stays fast and every action is retried and logged.

| Method and path | Purpose | Emits |
| --- | --- | --- |
| `GET /api/stations` | Status, last run, today's count per agent | — |
| `GET /api/events?agent=&since=&limit=` | Event log page for a station drawer | — |
| `GET /api/approvals?status=pending&kind=` | Inbox contents with payloads and media URLs | — |
| `POST /api/approvals/:id` `{decision, editPayload?}` | Approve, reject or edit one item | `<kind>.approved` / `.rejected` |
| `POST /api/approvals/bulk` `{ids[], decision}` | Bulk approve/reject | one event per item |
| `GET /api/orders?status=` | Orders table | — |
| `POST /api/orders/:id/message` `{body}` | Send a customer message about an order | `support.reply_sent` |
| `GET /api/products?status=` | Products with mockups and metrics | — |
| `POST /api/products/:id/pause` / `/retire` | Unpublish or retire a product | `store.product_paused` |
| `GET /api/agents/:name/runs` | Run history with tool calls | — |
| `POST /api/agents/:name/run` | Manual trigger | `<agent>.manual` |
| `GET` / `PUT /api/settings/prompts/:agent` | Read or edit an agent's `prompt.md` | `settings.prompt_updated` |
| `GET` / `PUT /api/settings/rules` | Approval rules and spend caps | `settings.rules_updated` |
| `POST /api/settings/pause` `{paused: bool}` | Pause or resume all crons | `system.paused` |
| `GET /api/metrics?from=&to=` | Daily metrics for the top bar and charts | — |
| `POST /api/webhooks/shopify/orders` | Shopify order create/update (HMAC) | `order.received` / `order.updated` |
| `POST /api/webhooks/printify` | Printify order status | `order.updated` |
| `POST /api/webhooks/gmail` | Gmail Pub/Sub push | `support.message_received` |
| `POST /api/inngest` | Inngest serve endpoint | — |

**Inngest events (the internal contract)**

`concept.approved`, `design.approved`, `product.approved`, `reply.approved`, `approval.requested`, `order.received`, `order.updated`, `order.issue`, `support.message_received`, `<agent>.manual`, `system.paused`. Every event payload carries `{refId, actor, ts}` plus the kind-specific fields; payload shapes are Zod schemas in `packages/jobs/events.ts` and are the only place they are defined.

## Four-week build plan

The order is deliberate: the pipeline that produces sellable products comes first, the pretty factory floor comes third, and trend research comes last because the first 60 concepts can be written by hand in an afternoon.

&#91;embedded content: build timeline · 4 weeks, 3 milestones\]

Each week is one Claude Code sprint; the week's checklist is the acceptance test. The holiday cutoff is a placeholder until Printify publishes its 2026 provider deadlines.

**Week 1 (9–15 Oct): foundation and Designer**

- [ ] Monorepo scaffold, Supabase project, Drizzle schema for all tables, migrations, seed script
- [ ] Inngest wired to Next.js with `health.heartbeat` and the agent run wrapper
- [ ] fal.ai client + Designer agent end to end: concept row in → 3 PNGs in storage → `design` approval row
- [ ] Minimal `/inbox` that lists design approvals and records a decision
- [ ] Printify and Shopify accounts created, custom app tokens stored, one product published by hand to learn the shape of the API responses

* Acceptance: 10 hand-written concepts produce 30 designs the operator can pick from

**Week 2 (16–22 Oct): Store ops and the full inbox**

- [ ] Printify client: blueprints, product create, mockups, publish; Shopify client: products, orders, webhooks
- [ ] Store ops agent: listing copy, product creation, `product` approval with mockups, publish on approval
- [ ] Inbox handles all four approval kinds with keyboard shortcuts and bulk approve
- [ ] `orders.sync` and the `/orders` screen

* Acceptance: 20 products live on Shopify, all created by the pipeline; a test order flows to Printify

**Week 3 (23–29 Oct): factory floor and Support**

- [ ] Factory floor SVG, station component, realtime event feed, conveyor animations, top bar metrics
- [ ] Gmail OAuth + Pub/Sub, Shopify Inbox webhook, Support agent with intent classification and drafts
- [ ] Approval rules table and graduated autonomy logic, settings screen for prompts and rules
- [ ] Store policy doc (shipping, returns, sizing) written and loaded for the Support agent

* Acceptance: a test support email gets a correct drafted reply citing real order data within 30 minutes; the floor shows it happening

**Week 4 (30 Oct – 5 Nov): Scout, Finance, hardening, launch**

- [ ] Trend scout with Tavily; Finance nightly rollup; `daily_metrics` charts on the floor
- [ ] Spend caps, pause switch, error alerting email, 7-day stability run with crons live
- [ ] Etsy channel in Printify if Shopify has been stable for 5 days; AI-disclosure text in the Etsy shop profile and listings
- [ ] Product photography pass: regenerate any mockups that look flat, write the store's About page

* Acceptance: 60 products live, agents ran 7 days without a manual restart, operator session timed under 20 minutes

**After launch (Nov–Dec)**

- Scout runs daily; approve 5–10 new concepts per session, aim for 150 products by Black Friday
- Pause products with zero views after 21 days; double down on niches with sales
- Tighten reply auto-send as categories graduate

## Guardrails, compliance, costs and open questions

The system is designed to fail quiet and safe: a stuck agent costs a day of listings, never a customer's money or the store's account standing.

**Platform compliance**

- Shopify: a custom app on your own store is fully within terms. Disclose AI-generated designs on the product page footer and the About page.
- Etsy (week 4, optional): one shop, owned and operated by you; the Creativity Standards require disclosing AI as the production method on listings; do not automate account creation, mass messaging or review solicitation. Publish through Printify's Etsy integration, which is an approved channel, rather than a custom Etsy API app that would need Etsy's approval.
- Fiverr, Upwork and similar marketplaces are excluded: no public API and their terms prohibit automated accounts.
- Email: `support@` only replies to inbound mail; the system never sends marketing or cold outreach.

**IP and content guardrails**

- `blocked_phrases` list seeded with common trademarked apparel phrases; Scout and Store ops both check against it
- No brands, characters, logos, celebrities, sports teams, song lyrics or movie quotes in any concept
- Designs that look like a specific living artist's style are rejected at concept stage (the prompt forbids "in the style of \[artist\]")
- Operator reviews every design until the `design` category graduates; graduation for designs is set to 50 items, not 20

**Operational guardrails**

- Daily spend cap per API (default: fal $15, Anthropic $10, Tavily $2); the cap pauses that agent and lights its station amber
- No agent can issue a refund, change a price by more than 15%, or delete a product; those are operator-only actions
- All outbound customer text is drafted from real order data; the Support prompt forbids promising delivery dates the tracking does not show
- Pause-all switch kills every cron within one tick (15 minutes)

**Estimated monthly cost at launch scale** (60 products, \~8 concepts/day)

| Item | Estimate |
| --- | --- |
| Shopify Basic | \~$39 |
| Vercel, Supabase, Inngest (hobby/free tiers early) | $0–45 |
| Image generation (\~30 images/day) | $40–80 |
| Anthropic API (agents) | $30–60 |
| Tavily | $0–20 |
| Printify | $0 (pay per order) |
| Total before product cost | \~$110–245 |

Margin per item after Printify cost at 2.2× pricing is roughly $6–10 on apparel and $4–6 on mugs; break-even on fixed costs is about 25–35 orders a month. Treat these as estimates to replace with real numbers from `daily_metrics` after week 2.

**Open questions to settle before week 1**

- [ ] Shop name, domain, and the one support email address
- [ ] Product set for launch: mugs, tees, sweatshirts, hoodies only, or add tote bags and posters?
- [ ] Pricing table: fixed 2.2× cost or per-product-type targets?
- [ ] Which print providers (US-only for faster holiday shipping is the safe choice)
- [ ] Shopify Inbox or email only for customer messages at launch
- [ ] Verify Printify's 2026 holiday order deadlines and set the `cutoff` milestone

**How to hand this to Claude Code**

Export this doc as Markdown into the repo as `SPEC.md`, then start each sprint with: "Read SPEC.md. We are in week N. Implement the week N checklist, one item per commit, writing tests for the agent run wrapper and the approval gate first." Keep `SPEC.md` updated as decisions are made; it is the contract between you and the agents.
