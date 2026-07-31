-- 940 Collector's Expo — homepage "Reserve Your Table" inquiry form storage.
-- These are general vendor inquiries/applications (NOT paid table holds — those
-- live in `reservations`). Run this in the Supabase SQL editor.

create table if not exists vendor_inquiries (
  id               uuid primary key default gen_random_uuid(),
  business         text,
  contact_name     text,
  email            text not null,
  phone            text,
  products         text[],
  tables_requested text,
  website          text,
  social           text,
  notes            text,
  status           text not null default 'new' check (status in ('new', 'archived')),
  created_at       timestamptz not null default now()
);

-- Server-only access via the service-role key.
alter table vendor_inquiries enable row level security;
