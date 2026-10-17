-- Ads support
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  placement text not null check (placement in ('hero','banner','popup')),
  media_type text not null check (media_type in ('image','video')),
  media_path text not null,
  link_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  priority integer not null default 0,
  clicks integer not null default 0,
  impressions integer not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ads enable row level security;

do $$ begin create policy "ads_public_read" on ads for select using (is_active and (ends_at is null or ends_at > now()) and (starts_at <= now())); exception when others then null; end $$;

do $$ begin create policy "ads_admin_write" on ads for all using (auth.role() = 'service_role'); exception when others then null; end $$;

create index if not exists ads_active_idx on ads (placement, is_active, starts_at, ends_at, priority desc);

create or replace function increment_ad_click(ad_id uuid)
returns void as $$
begin
  update ads set clicks = clicks + 1, updated_at = now() where id = ad_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function increment_ad_impression(ad_id uuid)
returns void as $$
begin
  update ads set impressions = impressions + 1, updated_at = now() where id = ad_id;
end;
$$ language plpgsql security definer set search_path = public;
