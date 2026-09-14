-- 940 Collector's Expo — allow archiving ticket orders.
-- Lets the admin reset online-ticket COUNTS for a new show without deleting the
-- old records (they become status 'archived' and drop out of the totals/lists).
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

alter table ticket_orders drop constraint if exists ticket_orders_status_check;
alter table ticket_orders
  add constraint ticket_orders_status_check
  check (status in ('pending', 'paid', 'archived'));
