-- Capture the phone number given at sign-up on the profile.
--
-- handle_new_user() runs the moment the auth user is inserted, so the number is
-- on record even for accounts that never confirm their email. That is what lets
-- an admin reach out to people whose sign-up verification mail bounced.

create or replace function handle_new_user() returns trigger as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'account_type', 'customer');
  safe_role text;
begin
  if requested_role not in ('customer','owner') then
    requested_role := 'customer';
  end if;
  safe_role := requested_role;

  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, safe_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
