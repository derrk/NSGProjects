# Secret Stock TX — Backend Architecture

Living record of the commerce backend and why it is shaped this way. Update it
when a significant decision changes.

The backend is a port of the ESU Store backend, so the decisions below keep ESU's
numbering (D1–D9) where they carry over unchanged. Decisions specific to Secret
Stock are numbered S1 onward.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript) — server components + server actions.
- **Prisma ORM → Neon Postgres** (`DATABASE_URL` pooled, `DIRECT_URL` direct for migrations).
- **Tailwind v4** semantic-token theme (Secret Stock purple on near-black).
- **Vercel Blob** for product images uploaded through the admin.
- **Zod** for input validation at every server-action boundary.

## Layout

```
src/app/(storefront)   Public pages — still rendering from src/lib/data.ts (Phase 3 moves these to the DB)
src/app/admin/login/   Passphrase login
src/app/admin/(dash)/  Gated admin — dashboard, inventory
src/app/api/           admin/upload (Vercel Blob)
src/lib/               db, auth, money, sku, inventory, products, settings,
                       validators, product-mapping, price-builder, rate-limit
prisma/                schema.prisma, migrations, seed.ts
src/proxy.ts           Gates /admin/* (Next 16 renamed `middleware` → `proxy`)
```

## Inherited decisions (from ESU)

### D2 — Flexible product model (discriminator + typed columns + JSON)
One `Product` table with a `productType` enum. Fields we search or filter on are
promoted to real, indexable columns (`game`, `setName`, `cardNumber`,
`gradingCompany`, `grade`, `certNumber`, `size`, `color`, `condition`, …). A JSON
`attributes` column holds the long tail.

Rejected: table-per-type (join and query complexity for a small shop), and
everything-in-JSON (can't index or filter by cert number, set, etc.).

### D3 — Variants deferred, but designed for
Apparel size runs are the real driver for variants, and Secret Stock has two
apparel SKUs with multiple sizes. For now their size runs live in
`attributes.sizes`, and `size` is only populated when a product has exactly one.
Cards and slabs are entered as **distinct SKUs**, which matches how collectibles
are actually listed. One-of-a-kind items use `isUnique = true`.

### D4 — Inventory ledger is the source of truth for *why*
`Product.quantity` is the current count; **`InventoryTransaction`** is an
append-only ledger (previousQty / change / newQty / type / channel / who / note).
Every stock mutation goes through `lib/inventory.ts#applyInventoryChange` inside
a Prisma `$transaction`. Nothing changes stock without a ledger row — including
the opening balance written by the seed.

### D5 — Money is integer cents everywhere; cost basis is first-class
`costCents` sits alongside `priceCents`. Inventory value = Σ cost×qty; retail
value = Σ price×qty. Format only at the edges, via `lib/money.ts`.

### D7 — Auth: passphrase now, roles later
A single shared passphrase (`ADMIN_PASSPHRASE`) is checked at `/admin/login`; on
success the cookie is set to `ADMIN_SESSION_TOKEN` and `src/proxy.ts` checks for
that exact value on every `/admin` request, with a second check in the dashboard
layout as defense in depth. Comparison is over SHA-256 digests so it is constant
time regardless of passphrase length. Login is rate limited to 8 attempts per 10
minutes per IP, because `/admin/login` is reachable from the open internet.

Upgrade path: per-user accounts + roles; the ledger's `userLabel` is already there.

## Secret Stock decisions

### S1 — Port by copying, not by extracting a shared package
ESU is a standalone repo; Secret Stock lives inside the `NSGProjects` monorepo.
A shared package would have to span both, and they are deployed separately. The
backend was copied and adapted instead, accepting that the two will drift.

What that cost: ESU's `app/` → `src/app/`, pnpm → npm, and a token-layer rewrite.

### S2 — Re-theme through semantic tokens, not by editing components
The ported admin is written against `bg-card`, `border-border`,
`text-muted-foreground` and friends rather than literal colors. Defining those
tokens in `globals.css` in Secret Stock's purple re-themes the whole dashboard
without touching a single component — which is also what makes future pulls from
ESU cheap.

`gold-rule` → `purple-rule` and `gold-text` → the existing `gradient-text` are
the only class renames.

### S3 — `ART` is a first-class product type
Secret Stock sells original canvas paintings, which ESU has no equivalent for.
`ART` joins the `ProductType` enum, with `medium`, `dimensions` and `artist`
promoted to columns. Original art is also `isUnique` by definition.

### S4 — `collectrId` reserved now, synced later
The old admin listed "Collectr Sync" as a coming-soon module and the inventory
page carries a Collectr banner. The column and its index exist from the first
migration so turning the sync on later is not a schema change.

### S5 — One migration for all tables, including unbuilt phases
`Order`, `OrderItem`, `Customer`, `StoreSettings` and `CollectionOffer` are in
the initial migration even though only inventory is wired up. Empty tables cost
nothing, the models are already proven in ESU, and it means Phases 2–4 are UI
work rather than migrations against a database holding live stock.

The dashboard's sales tiles query the real (empty) `Order` table, so they read
zero rather than being faked.

### S6 — The storefront still reads `src/lib/data.ts`
Phase 1 replaced the admin, not the shop. `data.ts` remains the source for the
public pages until Phase 3, and the seed reads that same file rather than
duplicating the rows, so the two cannot drift in the meantime.

Consequence: adding a product in the admin does **not** yet make it appear on the
storefront. That is the whole of Phase 3.

### S7 — The sell form writes to the database first, emails second
The form at /collections used to POST straight to Formspree, so every lead
lived in an inbox and nowhere else. It now writes a CollectionOffer and *then*
fires the notification, best-effort, inside a try/catch. A failed email can no
longer cost the shop a lead; the row is already saved and shows in the admin.

SELL_NOTIFY_URL holds the endpoint. It is empty in local .env on purpose, so
testing the form never emails a fake seller to the real inbox; set it in Vercel.

### S8 — The sell form is the one public write, so it is the one that is capped
Everything else that writes is behind the admin passphrase. /collections is not,
so the action carries a per-IP rate limit (5 per 10 minutes), a honeypot field
that succeeds silently rather than erroring, and max lengths on every string so
a bot cannot write a novel into the database.

### S9 — Offer status is free text, ranked in code
CollectionOffer.status is a String, not an enum, so adding a step to the
workflow needs no migration. The vocabulary lives in OFFER_STATUSES. Ordering
by it in SQL would sort alphabetically — "contacted" before "new", the wrong
end of the queue — so getCollectionOffers ranks in memory instead. Lead volume
at a card shop sorts in memory fine.

Booking an appointment moves the status to scheduled on its own, so a visit
that is on the calendar cannot still be sitting in the "new" pile.

## Phase map

- **Phase 1 (done):** Prisma schema + admin passphrase auth + inventory CRUD with
  the ledger + dashboard + seed from `data.ts`.
- **Phase 2 (done):** `/collections` form → `CollectionOffer` → admin Sell Requests workflow,
  replacing the Formspree-only form that stored nothing.
- **Phase 3:** storefront reads from the database; `/shop`, `/inventory`,
  `/collections` and the product pages stop importing `data.ts`.
- **Phase 4:** cart moves server-side, checkout, orders, Stripe (or ESU's
  reserve / pay-on-pickup mode, which runs with the keys blank).
- **Phase 5:** events as a model rather than a hardcoded array; shipping, email,
  reports, CSV import, Collectr sync.

## Setup

1. Create a Neon project — **separate from the ESU store's database**.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `DIRECT_URL`,
   `ADMIN_PASSPHRASE` and `ADMIN_SESSION_TOKEN`.
3. `npm run db:migrate` — creates the tables.
4. `npm run db:seed` — imports the catalog from `src/lib/data.ts`.
5. `npm run dev`, then sign in at `/admin/login`.

Both admin values must be set; with either missing, every login is refused
rather than falling open.
