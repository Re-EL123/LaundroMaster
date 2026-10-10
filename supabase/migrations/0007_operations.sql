-- ============================================================
-- 0007_operations.sql — operations, staff, messaging, loyalty
--   * order lifecycle: staff assignment, internal notes, message thread
--   * laundromat capacity / temporary pause controls
--   * customer address book, loyalty points and referrals
-- ============================================================

-- ---------------------------------------------------------------------------
-- Order lifecycle
-- ---------------------------------------------------------------------------
alter table bookings add column if not exists assigned_staff_id uuid references profiles(id) on delete set null;
alter table bookings add column if not exists internal_notes text;
create index if not exists idx_bookings_assigned on bookings(assigned_staff_id);

create table if not exists booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  sender_role text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_messages_booking on booking_messages(booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Laundromat capacity / availability
-- ---------------------------------------------------------------------------
alter table laundromats add column if not exists accepting_orders boolean not null default true;
alter table laundromats add column if not exists max_orders_per_day integer;
alter table laundromats add column if not exists extra_delivery_fee numeric not null default 0;
create index if not exists idx_laundromats_accepting on laundromats(accepting_orders);

-- ---------------------------------------------------------------------------
-- Customer address book, loyalty and referrals
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists addresses jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists referral_code text;
alter table profiles add column if not exists credit_balance numeric not null default 0;
create unique index if not exists profiles_referral_code_key on profiles(referral_code) where referral_code is not null;

create table if not exists loyalty_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  points integer not null,
  reason text not null,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_events_user on loyalty_events(user_id, created_at desc);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referee_id uuid references profiles(id) on delete set null,
  code text not null,
  status text not null default 'pending' check (status in ('pending','completed','rewarded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists referrals_referee_key on referrals(referee_id) where referee_id is not null;
create index if not exists idx_referrals_referrer on referrals(referrer_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table booking_messages enable row level security;

drop policy if exists booking_messages_participants on booking_messages;
create policy booking_messages_participants on booking_messages for select using (
  exists (
    select 1 from bookings b
    where b.id = booking_messages.booking_id
      and (
        b.customer_id = auth.uid()
        or is_admin(auth.uid())
        or exists (select 1 from laundromats l where l.id = b.laundromat_id and l.owner_id = auth.uid())
        or exists (select 1 from laundromat_members m where m.laundromat_id = b.laundromat_id and m.user_id = auth.uid())
      )
  )
);

alter table loyalty_events enable row level security;
drop policy if exists loyalty_events_own on loyalty_events;
create policy loyalty_events_own on loyalty_events for select using (user_id = auth.uid() or is_admin(auth.uid()));

alter table referrals enable row level security;
drop policy if exists referrals_own on referrals;
create policy referrals_own on referrals for select using (referrer_id = auth.uid() or referee_id = auth.uid() or is_admin(auth.uid()));

insert into platform_settings (key, value) values ('schema_operations', '7'::jsonb)
on conflict (key) do update set value = '7'::jsonb;
