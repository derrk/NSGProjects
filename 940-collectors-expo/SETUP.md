# 940 Collector's Expo — Setup & Deploy

The public site + reservation UI run with **zero config** (reservations fall back to
per-browser `localStorage` — fine for a demo, but NOT shared or authoritative).

To go **live** (shared database, no double-booking, cloud-stored vendor photos, and an
admin screen for Dustin to confirm Zelle payments), do the 3 steps below.

---

## 1. Create the Supabase database

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine). Pick a
   region close to Texas (e.g. `us-east-1`). Save the database password somewhere.
2. In the project, open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**.
   This creates the `reservations`, `reservation_tables`, and `blocked_tables` tables plus the
   index that guarantees a table can't be double-booked.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — server only)

## 2. Set environment variables

Copy `.env.example` → `.env.local` for local dev and fill in:

```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # service_role key
ADMIN_PASSCODE=pick-a-passcode              # for the /admin page (share with Dustin only)
```

Restart `pnpm dev`. The site now uses the database automatically (the reserve page detects it and
switches off the localStorage fallback).

## 3. Deploy to Vercel

1. Push the repo to GitHub and **Import** it in Vercel (Root Directory =
   `ProjectTCG/apps/card-show-website` if you deploy the monorepo).
2. In **Vercel → Project → Settings → Environment Variables**, add the same three vars
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSCODE`) for Production (and Preview).
3. Deploy, then point your domain at the project in **Settings → Domains**.

---

## How reservations work

- A vendor picks table(s) on the map → checkout collects their profile (business, IG, bio, email,
  photo) → **Submit & Hold** creates a **pending** hold in the database and shows Zelle instructions.
- Zelle payment goes to **Dustin Maberry · (940) 704-9931**, with the vendor's **business name in the
  memo**. (Edit these in `EVENT.zelle` in `app/reserve/tables.ts`.)
- Dustin opens **`/admin`**, enters the passcode, sees pending requests, matches the Zelle payment,
  and clicks **Confirm paid** (or **Release** to free the table). Confirmed tables show the vendor's
  photo on the public map.

## Pricing / codes (edit in `app/reserve/tables.ts` → `EVENT` / `PROMO_CODES`)

- `$99.99` per table; a 6′ end cap bundled with an adjacent 8′ table is `−$49.98` (pair = `$150`).
- Sample promo codes: `VENDOR10`, `FRIENDS25`, `FOUNDING50` — replace with your real ones.

## Notes / future

- Vendor photos are stored as small (~200px) data URLs in the DB — simple and fine for this scale.
  If you ever want originals, switch to Supabase Storage.
- Admin auth is a single shared passcode (httpOnly cookie). Fine for one organizer; upgrade to
  Supabase Auth if you want individual logins later.
- Real-time map updates currently use polling (every 15s + on tab focus). Supabase Realtime could
  make it instant later.
- Online card checkout can be added later behind the same flow (replace the Zelle step with Stripe).
