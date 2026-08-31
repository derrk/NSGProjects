-- 940 Collector's Expo — online attendee ticket sales.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

create table if not exists ticket_orders (
  id                uuid primary key default gen_random_uuid(),
  order_code        text unique not null,        -- shown to the buyer, e.g. 940TIX-12345
  name              text not null,
  phone             text not null,
  email             text not null,
  vip_qty           integer not null default 0,  -- $10, admits at 9am, 2 giveaway entries each
  ga_qty            integer not null default 0,  -- $5, admits at 10am, 1 giveaway entry each
  extra_entries     integer not null default 0,  -- $5 each, giveaway entry only (counted separately)
  giveaway_entries  integer not null default 0,  -- vip*2 + ga*1 + extra (computed at purchase)
  amount_cents      integer not null default 0,
  status            text not null default 'pending' check (status in ('pending', 'paid')),
  stripe_session_id text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ticket_orders_status on ticket_orders (status);
create index if not exists idx_ticket_orders_name   on ticket_orders (lower(name));
create index if not exists idx_ticket_orders_stripe on ticket_orders (stripe_session_id);

-- Locked down like the rest — all access via the service-role key on the server.
alter table ticket_orders enable row level security;
