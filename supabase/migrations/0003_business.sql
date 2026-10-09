-- LaundroMaster business model: owner SaaS plans, customer subscriptions,
-- commission (take-rate) ledger, promotions/featured listings, payouts,
-- refunds workflow and admin-controlled platform settings.

-- ---------------------------------------------------------------------------
-- Plans (owner SaaS tiers + customer subscription)
-- ---------------------------------------------------------------------------
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  audience text not null check (audience in ('owner', 'customer')),
  description text,
  price_monthly numeric not null default 0,
  currency text not null default 'ZAR',
  commission_percent numeric not null default 8,
  includes_branches integer not null default 1,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_audience_idx on plans(audience, is_active, sort);

-- ---------------------------------------------------------------------------
-- Subscriptions (one active per user per audience)
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  audience text not null check (audience in ('owner', 'customer')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions(user_id, audience, status);
create unique index if not exists subscriptions_active_unique
  on subscriptions(user_id, audience) where status in ('active', 'trialing');

-- ---------------------------------------------------------------------------
-- Promotions / featured listings
-- ---------------------------------------------------------------------------
create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'featured' check (kind in ('featured', 'discount')),
  amount_paid numeric not null default 0,
  currency text not null default 'ZAR',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists promotions_laundromat_idx on promotions(laundromat_id, status);
create index if not exists promotions_owner_idx on promotions(owner_id, status);

-- ---------------------------------------------------------------------------
-- Commission (take-rate) ledger — one row per booking
-- ---------------------------------------------------------------------------
create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  owner_id uuid references profiles(id),
  gross_amount numeric not null default 0,
  delivery_fee numeric not null default 0,
  commission_percent numeric not null default 0,
  commission_amount numeric not null default 0,
  net_amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'settled', 'reversed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (booking_id)
);
create index if not exists commissions_owner_idx on commissions(owner_id, status);

-- ---------------------------------------------------------------------------
-- Payouts (owner withdrawals)
-- ---------------------------------------------------------------------------
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  currency text not null default 'ZAR',
  status text not null default 'requested' check (status in ('requested', 'processing', 'paid', 'rejected')),
  method text,
  reference text,
  notes text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payouts_owner_idx on payouts(owner_id, status);
create index if not exists payouts_status_idx on payouts(status);

-- ---------------------------------------------------------------------------
-- Booking financial breakdown + featured denormalised flags
-- ---------------------------------------------------------------------------
alter table bookings add column if not exists commission_amount numeric not null default 0;
alter table bookings add column if not exists platform_fee numeric not null default 0;
alter table bookings add column if not exists owner_net numeric not null default 0;

alter table laundromats add column if not exists is_featured boolean not null default false;
alter table laundromats add column if not exists featured_until timestamptz;

-- ---------------------------------------------------------------------------
-- Default plans
-- ---------------------------------------------------------------------------
insert into plans (code, name, audience, description, price_monthly, commission_percent, includes_branches, features, sort) values
  ('owner_free',  'Starter', 'owner', 'Get discovered and start taking bookings.', 0,   10, 1,
    '["Public profile","Booking inbox","Basic earnings","Payout requests"]'::jsonb, 1),
  ('owner_pro',   'Pro',     'owner', 'Lower take-rate and tools to grow.',        299,  4, 3,
    '["Everything in Starter","Lower 4% take-rate","3 branches","Promoted listing credit","Priority support"]'::jsonb, 2),
  ('owner_chain', 'Chain',   'owner', 'Run multiple laundromats at scale.',        799,  2, 10,
    '["Everything in Pro","2% take-rate","10 branches","Consolidated reporting","API access","Dedicated manager"]'::jsonb, 3),
  ('customer_plus','LaundroMaster+', 'customer', 'Free pickup & delivery on every order.', 99, 0, 0,
    '["Free pickup & delivery","Priority support","Members-only offers"]'::jsonb, 1)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Default platform settings (admin-controlled)
-- ---------------------------------------------------------------------------
insert into platform_settings (key, value) values
  ('commission_percent',        '8'::jsonb),
  ('delivery_fee',              '25'::jsonb),
  ('payout_min',                '200'::jsonb),
  ('payout_auto_approve',       'false'::jsonb),
  ('promotion_price',           '199'::jsonb),
  ('promotion_days',            '30'::jsonb),
  ('currency',                  '"ZAR"'::jsonb),
  ('market',                    '"ZA"'::jsonb),
  ('platform_name',             '"LaundroMaster"'::jsonb),
  ('customer_plus_free_delivery','true'::jsonb),
  ('feature_owner_subscriptions','true'::jsonb),
  ('feature_customer_plans',    'true'::jsonb),
  ('feature_promotions',        'true'::jsonb),
  ('feature_payouts',           'true'::jsonb),
  ('feature_refunds',           'true'::jsonb),
  ('maintenance_mode',          'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table plans enable row level security;
alter table subscriptions enable row level security;

-- policies
drop policy if exists plans_read on plans;
create policy plans_read on plans for select using (true);

drop policy if exists subscriptions_own on subscriptions;
create policy subscriptions_own on subscriptions for select using (auth.uid() = user_id);

alter table promotions enable row level security;
drop policy if exists promotions_read on promotions;
create policy promotions_read on promotions for select using (
  status = 'active' or auth.uid() = owner_id
);

alter table commissions enable row level security;
drop policy if exists commissions_owner on commissions;
create policy commissions_owner on commissions for select using (auth.uid() = owner_id);

alter table payouts enable row level security;
drop policy if exists payouts_owner on payouts;
create policy payouts_owner on payouts for select using (auth.uid() = owner_id);

insert into platform_settings (key, value) values ('schema_business', '3'::jsonb)
on conflict (key) do update set value = '3'::jsonb;
