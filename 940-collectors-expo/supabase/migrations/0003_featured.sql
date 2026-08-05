-- 940 Collector's Expo — add a "featured" flag so admins can spotlight
-- confirmed vendors on the homepage Featured Vendors cards.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

alter table reservations
  add column if not exists featured boolean not null default false;

-- Quick lookup of the (small) set of featured vendors.
create index if not exists idx_reservations_featured
  on reservations (featured)
  where featured;
