-- 940 Collector's Expo — add a "spotlight_posted" flag so admins can track
-- which vendors have had their Instagram spotlight post created + uploaded.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

alter table reservations
  add column if not exists spotlight_posted boolean not null default false;
