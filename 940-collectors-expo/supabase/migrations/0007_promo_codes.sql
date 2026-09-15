-- 940 Collector's Expo — admin-managed discount codes.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

create table if not exists promo_codes (
  code       text primary key,                                   -- stored UPPERCASE
  type       text not null check (type in ('fixed','percent','table_price')),
  value      integer not null,                                   -- cents (fixed/table_price) or whole percent
  label      text not null,
  max_uses   integer,                                            -- null = unlimited
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table promo_codes enable row level security;

-- Seed the existing early-bird code so it keeps working (usage is counted from
-- the reservations table, so its current redemptions carry over).
insert into promo_codes (code, type, value, label, max_uses, active)
values ('EARLYBIRD940', 'table_price', 8500, 'Early bird — $85 per table', 25, true)
on conflict (code) do nothing;
