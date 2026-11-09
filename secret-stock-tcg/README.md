# Secret Stock TX

Storefront and inventory admin for Secret Stock TX — Pokémon, One Piece, sports
cards, graded slabs, sealed product, original art and apparel, out of Wichita
Falls, TX.

Next.js 16 (App Router) · React 19 · Tailwind v4 · Prisma → Neon Postgres.

## Getting started

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

Phase 1 needs four values: `DATABASE_URL` and `DIRECT_URL` from a
[Neon](https://neon.tech) project, plus `ADMIN_PASSPHRASE` and
`ADMIN_SESSION_TOKEN`. Generate the session token with:

```bash
openssl rand -hex 32
```

Create the tables and import the current catalog:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Then run the dev server:

```bash
npm run dev
```

The storefront is at http://localhost:3000 and the admin at
http://localhost:3000/admin.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Import `src/lib/data.ts` into Postgres |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:reset` | Drop, re-migrate and re-seed — destroys all data |

## Where things are

See [BACKEND.md](BACKEND.md) for the architecture, the decisions behind it, and
the phase map. In short:

- `src/app/admin/` — passphrase-gated inventory admin, backed by Postgres.
- `src/app/` (everything else) — the public storefront, which still renders from
  `src/lib/data.ts` until Phase 3 moves it onto the database.
- `prisma/` — schema, migrations and the seed that imports `data.ts`.

## A note on OneDrive

This repo lives in a OneDrive-synced folder. OneDrive can leave files as
cloud placeholders that tools cannot read, which shows up as
`UNKNOWN: unknown error, read` — Prisma and `tsc` both hit this. If that
happens, reinstall the affected package, or exclude `node_modules` from
syncing.
