-- 0008_promotions_payments.sql — allow payments for promotions and extend purpose enum
do $$
begin
  alter table payments
    drop constraint if exists payments_purpose_check;
  alter table payments
    add constraint payments_purpose_check check (purpose in ('booking', 'subscription', 'promotion'));
exception
  when others then null;
end $$;

alter table payments add column if not exists metadata jsonb not null default '{}'::jsonb;
