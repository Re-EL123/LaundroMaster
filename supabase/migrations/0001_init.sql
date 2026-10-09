-- LaundroMaster initial schema
create extension if not exists "pgcrypto";

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_path text,
  account_status text not null default 'active' check (account_status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('customer','owner','staff','admin','super_admin')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists laundromats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete restrict,
  name text not null,
  description text,
  logo_path text,
  address text,
  latitude numeric,
  longitude numeric,
  rating_average numeric not null default 0,
  rating_count integer not null default 0,
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected','suspended')),
  business_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_laundromats_verification on laundromats(verification_status);
create index if not exists idx_laundromats_owner on laundromats(owner_id);

create table if not exists laundromat_members (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  member_role text not null default 'staff' check (member_role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique (laundromat_id, user_id)
);

create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  category_id uuid references service_categories(id),
  name text not null,
  description text,
  base_price numeric not null default 0 check (base_price >= 0),
  turnaround_hours integer not null default 24 check (turnaround_hours >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_services_laundromat on services(laundromat_id, is_active);

create table if not exists operating_hours (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  open_time time,
  close_time time,
  is_closed boolean not null default false,
  unique (laundromat_id, weekday)
);

create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  name text,
  radius_km numeric check (radius_km >= 0),
  fee numeric not null default 0 check (fee >= 0)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete restrict,
  laundromat_id uuid not null references laundromats(id) on delete restrict,
  status text not null default 'pending_payment' check (status in (
    'pending_payment','pending_acceptance','accepted','pickup_scheduled','collected',
    'washing','drying','ironing','ready','out_for_delivery','completed',
    'cancelled','rejected','payment_failed','refund_pending')),
  currency text not null default 'ZAR',
  subtotal_amount numeric not null default 0 check (subtotal_amount >= 0),
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  total_amount numeric not null default 0 check (total_amount >= 0),
  pickup_required boolean not null default false,
  delivery_required boolean not null default false,
  pickup_address jsonb,
  delivery_address jsonb,
  scheduled_at timestamptz,
  customer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bookings_customer on bookings(customer_id);
create index if not exists idx_bookings_laundromat on bookings(laundromat_id);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_bookings_created on bookings(created_at desc);

create table if not exists booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  service_id uuid references services(id),
  service_name_snapshot text not null,
  unit_price_snapshot numeric not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric not null check (line_total >= 0)
);

create table if not exists booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  status text not null,
  actor_id uuid references profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  provider text not null default 'ikhokha',
  provider_reference text unique,
  amount numeric not null check (amount >= 0),
  currency text not null default 'ZAR',
  status text not null default 'created' check (status in ('created','pending','succeeded','failed','cancelled','refund_pending','partially_refunded','refunded')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  status text not null default 'pending',
  provider_reference text,
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  moderation_status text not null default 'published' check (moderation_status in ('pending','published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists idx_reviews_laundromat on reviews(laundromat_id, created_at desc);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, laundromat_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, read_at);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  storage_path text not null,
  doc_type text,
  verification_state text not null default 'pending' check (verification_state in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists staff_permissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references laundromat_members(id) on delete cascade,
  permission text not null,
  granted boolean not null default true,
  unique (member_id, permission)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid references laundromats(id),
  booking_id uuid references bookings(id),
  type text not null,
  amount numeric not null,
  currency text not null default 'ZAR',
  created_at timestamptz not null default now()
);

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  laundromat_id uuid not null references laundromats(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

create table if not exists admin_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists platform_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','laundromats','bookings','payments'] loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ============ Row Level Security ============
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table laundromats enable row level security;
alter table laundromat_members enable row level security;
alter table services enable row level security;
alter table bookings enable row level security;
alter table booking_items enable row level security;
alter table payments enable row level security;
alter table reviews enable row level security;
alter table favorites enable row level security;
alter table notifications enable row level security;
alter table documents enable row level security;

create or replace function is_admin(uid uuid) returns boolean as $$
  select exists(select 1 from user_roles where user_id = uid and role in ('admin','super_admin'));
$$ language sql stable security definer;

create policy "profiles self read" on profiles for select using (auth.uid() = id or is_admin(auth.uid()));
create policy "profiles self update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "user_roles self read" on user_roles for select using (auth.uid() = user_id or is_admin(auth.uid()));

create policy "laundromats public approved read" on laundromats for select using (verification_status = 'approved' or owner_id = auth.uid() or is_admin(auth.uid()));
create policy "laundromats owner insert" on laundromats for insert with check (owner_id = auth.uid());
create policy "laundromats owner update" on laundromats for update using (owner_id = auth.uid() or is_admin(auth.uid()));

create policy "services public approved read" on services for select using (
  (is_active and exists(select 1 from laundromats l where l.id = services.laundromat_id and l.verification_status = 'approved'))
  or exists(select 1 from laundromats l where l.id = services.laundromat_id and l.owner_id = auth.uid())
  or is_admin(auth.uid()));

create policy "bookings customer read" on bookings for select using (customer_id = auth.uid() or is_admin(auth.uid()));
create policy "bookings customer insert" on bookings for insert with check (customer_id = auth.uid());
create policy "bookings owner read" on bookings for select using (exists(select 1 from laundromats l where l.id = bookings.laundromat_id and l.owner_id = auth.uid()));
create policy "bookings owner update" on bookings for update using (exists(select 1 from laundromats l where l.id = bookings.laundromat_id and l.owner_id = auth.uid()));

create policy "booking_items read own" on booking_items for select using (exists(select 1 from bookings b where b.id = booking_items.booking_id and (b.customer_id = auth.uid() or is_admin(auth.uid()) or exists(select 1 from laundromats l where l.id = b.laundromat_id and l.owner_id = auth.uid()))));

create policy "payments read own" on payments for select using (exists(select 1 from bookings b where b.id = payments.booking_id and (b.customer_id = auth.uid() or is_admin(auth.uid()) or exists(select 1 from laundromats l where l.id = b.laundromat_id and l.owner_id = auth.uid()))));

create policy "reviews public read" on reviews for select using (moderation_status = 'published' or customer_id = auth.uid() or is_admin(auth.uid()));

create policy "favorites own" on favorites for select using (user_id = auth.uid());
create policy "favorites own insert" on favorites for insert with check (user_id = auth.uid());
create policy "favorites own delete" on favorites for delete using (user_id = auth.uid());

create policy "notifications self read" on notifications for select using (user_id = auth.uid() or is_admin(auth.uid()));
create policy "notifications self update" on notifications for update using (user_id = auth.uid());

create policy "documents owner read" on documents for select using (exists(select 1 from laundromats l where l.id = documents.laundromat_id and l.owner_id = auth.uid()) or is_admin(auth.uid()));
