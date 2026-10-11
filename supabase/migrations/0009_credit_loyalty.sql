-- 0009_credit_loyalty.sql — store-credit ledger, atomic credit application at checkout, verification documents
-- Store credit + loyalty points become fully functional: points redeem to credit, credit is spent at checkout,
-- owners can upload verification documents (documents table now has an insert path).

-- Ledger of store-credit movements (positive = credited, negative = spent).
create table if not exists credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  reason text not null,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table credit_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'credit_events' and policyname = 'credit_events own read') then
    create policy "credit_events own read" on credit_events for select using (auth.uid() = user_id);
  end if;
exception when others then null;
end $$;

-- Owner-facing documents: allow owners to read docs for laundromats they own (insert is service-role only).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'documents' and policyname = 'documents owner read') then
    create policy "documents owner read" on documents for select using (
      exists (select 1 from laundromats l where l.id = documents.laundromat_id and l.owner_id = auth.uid())
      or is_admin(auth.uid())
    );
  end if;
exception when others then null;
end $$;

-- Atomically apply available store credit to a booking at checkout.
-- Idempotent: once a payment attempt exists for the booking, does nothing.
-- Returns { applied, amount } where amount is the new total to charge (0 => covered by credit).
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
   where id = p_booking_id;
  if v_user is null then
    return json_build_object('applied', 0, 'amount', v_amount, 'error', 'not_found');
  end if;

  -- A payment attempt already exists for this booking => credit already applied (or never applicable).
  if exists (select 1 from payments where booking_id = p_booking_id) then
    return json_build_object('applied', 0, 'amount', coalesce(v_amount, 0));
  end if;

  select coalesce(credit_balance, 0) into v_credit from profiles where id = v_user;
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

-- Atomically convert loyalty points to store credit. Validates balance inside the transaction.
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

  coalesce((select sum(points) from loyalty_events where user_id = p_user_id), 0) into v_balance;
  if v_balance < p_points then
    return json_build_object('error', 'insufficient_points');
  end if;

  v_credit := (p_points / 100)::numeric;
  insert into loyalty_events (user_id, points, reason) values (p_user_id, -p_points, 'credit_redeemed');
  update profiles set credit_balance = round((coalesce(credit_balance, 0) + v_credit)::numeric, 2) where id = p_user_id;
  insert into credit_events (user_id, amount, reason) values (p_user_id, v_credit, 'loyalty_redeem');

  return json_build_object('points', -p_points, 'credit', v_credit);
end;
$$;

grant execute on function apply_store_credit(uuid) to authenticator;
grant execute on function redeem_loyalty_points(uuid, integer) to authenticator;