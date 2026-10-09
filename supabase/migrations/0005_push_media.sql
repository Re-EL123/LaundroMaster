-- LaundroMaster PWA + push + media: web push subscriptions, image galleries, storage buckets.
-- Safe to run multiple times.

-- Web Push subscriptions (one row per browser/device).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Deep-link payload for in-app notification routing.
alter table notifications add column if not exists data jsonb not null default '{}'::jsonb;

-- Image galleries / attachments.
alter table laundromats add column if not exists photos jsonb not null default '[]'::jsonb;
alter table laundromats add column if not exists phone text;
alter table services add column if not exists image_path text;
alter table reviews add column if not exists photos jsonb not null default '[]'::jsonb;

-- Storage buckets used by the uploads API (idempotent).
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('laundromat-media', 'laundromat-media', true),
  ('verification-documents', 'verification-documents', false),
  ('booking-attachments', 'booking-attachments', false),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

insert into platform_settings (key, value) values ('schema_push', '5'::jsonb)
on conflict (key) do update set value = '5'::jsonb;
