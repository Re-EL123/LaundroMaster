-- ============================================================
-- 0006_billing_ikhokha.sql — full payments/subscription billing
--   * payments can serve bookings AND subscriptions (iKhokha paylinks)
--   * subscriptions link to the payment that activated them
--   * lazy expiry support for auto-downgrade at period end
-- ============================================================

-- payments: allow non-booking (subscription) payments and store gateway fields
alter table payments alter column booking_id drop not null;
alter table payments add column if not exists user_id uuid references profiles(id) on delete set null;
alter table payments add column if not exists purpose text not null default 'booking'
  check (purpose in ('booking', 'subscription'));
alter table payments add column if not exists plan_id uuid references plans(id) on delete set null;
alter table payments add column if not exists audience text
  check (audience in ('owner', 'customer'));
alter table payments add column if not exists paylink_id text;
alter table payments add column if not exists checkout_url text;
alter table payments add column if not exists paid_at timestamptz;
alter table payments add column if not exists raw_status text;
alter table payments add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_payments_user on payments(user_id, purpose, created_at desc);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_payments_paylink on payments(paylink_id);

-- subscriptions: track the payment + renewal period
alter table subscriptions add column if not exists payment_id uuid references payments(id) on delete set null;
alter table subscriptions add column if not exists auto_renew boolean not null default false;
create index if not exists idx_subscriptions_period on subscriptions(status, current_period_end);

-- RLS: users may read their own payments (booking *or* subscription)
drop policy if exists "payments read own" on payments;
create policy "payments read own" on payments for select using (
  user_id = auth.uid()
  or exists(select 1 from bookings b where b.id = payments.booking_id and (
    b.customer_id = auth.uid() or is_admin(auth.uid())
    or exists(select 1 from laundromats l where l.id = b.laundromat_id and l.owner_id = auth.uid())
  ))
);

insert into platform_settings (key, value) values ('schema_billing', '6'::jsonb)
on conflict (key) do update set value = '6'::jsonb;
