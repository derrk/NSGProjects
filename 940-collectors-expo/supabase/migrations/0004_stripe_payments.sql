-- 940 Collector's Expo — Stripe card payments + a 12-hour hold deadline.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

alter table reservations
  add column if not exists payment_method    text not null default 'zelle',
  add column if not exists stripe_session_id text,
  add column if not exists paid_at           timestamptz,
  add column if not exists expires_at        timestamptz;

-- Which rail this hold is paying on.
alter table reservations drop constraint if exists reservations_payment_method_check;
alter table reservations
  add constraint reservations_payment_method_check
  check (payment_method in ('zelle', 'stripe'));

-- Fast webhook lookup by Checkout Session id, and the pending-expiry sweep.
create index if not exists idx_reservations_stripe_session on reservations (stripe_session_id);
create index if not exists idx_reservations_pending_expiry on reservations (status, expires_at);

-- Note: expired holds reuse the existing 'released' status (status stays
-- 'pending' | 'confirmed' | 'released'); no status CHECK change is needed.
