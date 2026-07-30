-- 940 Collector's Expo — vendor reservation schema.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

create extension if not exists pgcrypto;

-- One reservation = one vendor's request for one or more tables.
create table if not exists reservations (
  id            uuid primary key default gen_random_uuid(),
  res_code      text unique not null,                       -- shown to the vendor, e.g. 940CE-12345
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'released')),
  business      text not null,
  first_name    text,
  last_name     text,
  email         text not null,
  phone         text,
  instagram     text,
  bio           text,
  category      text,
  photo         text,                                       -- downscaled data URL
  amount_cents  integer not null default 0,
  promo_code    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Which physical tables a reservation holds. `active` mirrors "not released" so a
-- partial unique index can guarantee a table is in at most ONE active reservation.
create table if not exists reservation_tables (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  table_number   integer not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- The core double-booking guard: no two ACTIVE rows may share a table_number.
create unique index if not exists uniq_active_table
  on reservation_tables (table_number)
  where active;

create index if not exists idx_restables_res on reservation_tables (reservation_id);

-- Admin-blocked tables (kept out of circulation).
create table if not exists blocked_tables (
  table_number integer primary key,
  reason       text,
  created_at   timestamptz not null default now()
);

-- Lock everything down: all app access goes through server routes using the
-- service-role key (which bypasses RLS). With RLS on and no policies, the public
-- anon key can read/write nothing directly.
alter table reservations       enable row level security;
alter table reservation_tables enable row level security;
alter table blocked_tables      enable row level security;
