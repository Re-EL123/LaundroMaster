-- LaundroMaster UX metrics: listing views + promotion performance.
-- Safe to run multiple times.

alter table laundromats add column if not exists view_count integer not null default 0;
alter table promotions add column if not exists impressions integer not null default 0;
alter table promotions add column if not exists clicks integer not null default 0;

create index if not exists idx_laundromats_view_count on laundromats(view_count desc);

insert into platform_settings (key, value) values ('schema_ux', '4'::jsonb)
on conflict (key) do update set value = '4'::jsonb;
