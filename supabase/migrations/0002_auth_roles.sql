-- Role-based auth: create profile + default role on signup, and role helper.

-- current user's effective role (prefers highest privilege)
create or replace function current_user_role(uid uuid) returns text as $$
  select role from user_roles
  where user_id = uid
  order by case role
    when 'super_admin' then 1
    when 'admin' then 2
    when 'owner' then 3
    when 'staff' then 4
    else 5
  end
  limit 1;
$$ language sql stable security definer;

-- create profile + role when a new auth user is created
create or replace function handle_new_user() returns trigger as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'account_type', 'customer');
  safe_role text;
begin
  if requested_role not in ('customer','owner') then
    requested_role := 'customer';
  end if;
  safe_role := requested_role;

  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, safe_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
