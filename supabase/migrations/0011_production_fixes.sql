-- 0011_production_fixes.sql — correctness, safety and operational fixes
--
-- Apply after 0010. Everything in this migration is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Team invitations require explicit acceptance.
-- ---------------------------------------------------------------------------
alter table laundromat_members
  add column if not exists invite_status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'laundromat_members_invite_status_check'
  ) then
    alter table laundromat_members
      add constraint laundromat_members_invite_status_check
      check (invite_status in ('pending', 'active', 'declined'));
  end if;
end $$;

create index if not exists laundromat_members_invite_idx
  on laundromat_members (user_id, invite_status);

-- ---------------------------------------------------------------------------
-- 2. Payments always default to the live gateway (0001 defaulted to ikhokha).
--    Historical rows keep the gateway they were actually created with.
-- ---------------------------------------------------------------------------
alter table payments alter column provider set default 'payfast';

-- ---------------------------------------------------------------------------
-- 3. Refunds get a processing timestamp + bookings can end in 'refunded'.
-- ---------------------------------------------------------------------------
alter table refunds
  add column if not exists processed_at timestamptz;

do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%pending_payment%'
  loop
    execute format('alter table bookings drop constraint %I', con.conname);
  end loop;

  alter table bookings
    add constraint bookings_status_check check (status in (
      'pending_payment','pending_acceptance','accepted','pickup_scheduled','collected',
      'washing','drying','ironing','ready','out_for_delivery','completed',
      'cancelled','rejected','payment_failed','refund_pending','refunded'
    ));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Loyalty redemption: correct maths, safe under concurrency.
-- ---------------------------------------------------------------------------
create or replace function redeem_loyalty_points(p_user_id uuid, p_points integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_credit numeric;
begin
  if p_points is null or p_points < 100 then
    return json_build_object('error', 'below_minimum');
  end if;
  -- 100 points = 1 credit; integers keep the credit at two decimals.

  -- Serialise concurrent redemptions for the same user.
  perform 1 from profiles where id = p_user_id for update;
  if not found then
    return json_build_object('error', 'not_found');
  end if;

  select coalesce(sum(points), 0) into v_balance
    from loyalty_events
   where user_id = p_user_id;

  if v_balance < p_points then
    return json_build_object('error', 'insufficient_points');
  end if;

  v_credit := round((p_points::numeric / 100.0), 2);
  insert into loyalty_events (user_id, points, reason)
  values (p_user_id, -p_points, 'credit_redeemed');

  update profiles
     set credit_balance = round((coalesce(credit_balance, 0) + v_credit)::numeric, 2)
   where id = p_user_id;

  insert into credit_events (user_id, amount, reason)
  values (p_user_id, v_credit, 'loyalty_redeem');

  return json_build_object('points', -p_points, 'credit', v_credit);
end;
$$;

grant execute on function redeem_loyalty_points(uuid, integer) to authenticator;

-- ---------------------------------------------------------------------------
-- 5. Store credit: lock the booking + profile rows before reading balances.
-- ---------------------------------------------------------------------------
create or replace function apply_store_credit(p_booking_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_amount numeric;
  v_credit numeric;
  v_applied numeric;
begin
  select customer_id, total_amount
    into v_user, v_amount
    from bookings
   where id = p_booking_id
   for update;

  if v_user is null then
    return json_build_object('applied', 0, 'amount', v_amount, 'error', 'not_found');
  end if;

  if exists (select 1 from payments where booking_id = p_booking_id) then
    return json_build_object('applied', 0, 'amount', coalesce(v_amount, 0));
  end if;

  select coalesce(credit_balance, 0)
    into v_credit
    from profiles
   where id = v_user
   for update;

  v_applied := least(v_credit, coalesce(v_amount, 0));
  if v_applied <= 0 then
    return json_build_object('applied', 0, 'amount', coalesce(v_amount, 0));
  end if;

  update profiles
     set credit_balance = round((coalesce(credit_balance, 0) - v_applied)::numeric, 2)
   where id = v_user;

  update bookings
     set discount_amount = round((coalesce(discount_amount, 0) + v_applied)::numeric, 2),
         total_amount = round((coalesce(total_amount, 0) - v_applied)::numeric, 2),
         updated_at = now()
   where id = p_booking_id;

  insert into credit_events (user_id, amount, reason, booking_id)
  values (v_user, -v_applied, 'checkout', p_booking_id);

  return json_build_object('applied', v_applied, 'amount', round((coalesce(v_amount, 0) - v_applied)::numeric, 2));
end;
$$;

grant execute on function apply_store_credit(uuid) to authenticator;

-- ---------------------------------------------------------------------------
-- 6. Rate limiting shared across serverless instances.
-- ---------------------------------------------------------------------------
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table rate_limits enable row level security;

create or replace function check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_start timestamptz;
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
begin
  if p_key is null or p_key = '' then
    return json_build_object('allowed', true, 'count', 0, 'reset_at', now() + v_window);
  end if;

  -- Opportunistic cleanup so the table cannot grow without bound.
  if random() < 0.05 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rate_limits.window_start < now() - v_window then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start < now() - v_window then now()
          else rate_limits.window_start
        end
  returning count, window_start into v_count, v_start;

  return json_build_object(
    'allowed', v_count <= greatest(p_limit, 1),
    'count', v_count,
    'limit', greatest(p_limit, 1),
    'reset_at', v_start + v_window
  );
end;
$$;

grant execute on function check_rate_limit(text, integer, integer) to authenticator;

-- ---------------------------------------------------------------------------
-- 7. Discovery indexes.
-- ---------------------------------------------------------------------------
create index if not exists laundromats_geo_idx
  on laundromats (latitude, longitude)
  where latitude is not null and longitude is not null;

create index if not exists laundromats_approved_idx
  on laundromats (verification_status, rating_average desc);

-- ---------------------------------------------------------------------------
-- 8. Helper functions are server-only. They are SECURITY DEFINER, so PUBLIC
--    execute would let any client call them directly through PostgREST.
-- ---------------------------------------------------------------------------
revoke all on function redeem_loyalty_points(uuid, integer) from public;
revoke all on function apply_store_credit(uuid) from public;
revoke all on function check_rate_limit(text, integer, integer) from public;
revoke all on function increment_ad_click(uuid) from public;
revoke all on function increment_ad_impression(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function redeem_loyalty_points(uuid, integer) to service_role;
    grant execute on function apply_store_credit(uuid) to service_role;
    grant execute on function check_rate_limit(text, integer, integer) to service_role;
    grant execute on function increment_ad_click(uuid) to service_role;
    grant execute on function increment_ad_impression(uuid) to service_role;
  end if;
end $$;
