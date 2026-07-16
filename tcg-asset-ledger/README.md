# TCG Asset Ledger

A local-first asset ledger for trading card vendors and card shops. Not just an
inventory app — it tracks the full papertrail of every card, sealed product,
slab, buy, sale, trade, break, and prize, with **real cost basis carried through
trades**.

It answers: *What do I own? What did I pay? What did I trade to get it? What's my
real cost basis? What did it sell for? What was my actual profit?*

## Core idea

Inventory is **derived from transactions**, never overwritten. Every business
action posts a `Transaction` with `TransactionLine`s (assets IN / OUT + a cash
delta), and asset rows change only as a side effect. That's what makes the
papertrail trustworthy.

**Cost-basis rule:** when you acquire assets, their basis =
`(basis of everything you gave up) + (cash you paid)`, allocated across what you
received by market value. Example: buy Card A for $24, trade A + $143 cash for
Card B → Card B's basis is **$167**.

## Works in tandem with Collectr

Collectr stays your pricing/collection backbone; this app is the fast on-the-fly
operational layer for a show. Export from Collectr any time and import here:

- **new card** → created
- **known card, untouched by the ledger** → quantity + cost + price refreshed
- **known card the ledger already tracks** (you've traded/sold it here) →
  **price only** is refreshed; your computed cost basis and quantity are never
  clobbered, and any quantity conflict is flagged for review.

Matching is by natural key: `game | set | name | card# | variant | grade | condition`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 6 + SQLite.
All money is stored as **integer cents**.

## Getting started

```bash
pnpm install
pnpm db:migrate        # apply the schema to dev.db
pnpm dev               # http://localhost:3000
```

Import your Collectr CSV from **Import from Collectr** in the nav, or record a
buy/sell/trade directly.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm test` | Cost-basis + CSV parser unit tests |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:studio` | Browse the DB |
| `pnpm exec tsx scripts/test-import.ts <path.csv>` | Import a Collectr CSV from the CLI |

## Layout

- `lib/costbasis.ts` — pure cost-basis math (unit-tested)
- `lib/ledger.ts` — the only place inventory mutates (buy/sell/trade/break/prize/adjust)
- `lib/collectr.ts` — Collectr CSV parser
- `lib/import-collectr.ts` — reconciliation engine
- `app/` — dashboard, inventory, ledger, reports, and the record flows

## Out of scope (per MVP)

Grading workflow, prize wheel, online marketplace, and customer CRM are
deliberately not built — the `Grading` / `Used as Prize` statuses exist so the
data model is ready for them later.
