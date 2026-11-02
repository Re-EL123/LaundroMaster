-- 0013: Make the advertised plan benefits actually enforced.
--
-- The plan cards promised branch limits, promotion credits and a
-- members-only discount that the code never applied. This migration adds the
-- columns those features need and rewrites the plan copy so the cards only
-- advertise what the platform enforces.
--
-- Claimed but NOT enforced (reworded out rather than faked): "Priority
-- support", "API access" and "Dedicated manager".

-- Owner plans grant a number of free promoted listings per billing period.
alter table plans add column if not exists promotion_credits integer not null default 0;

-- Distinguish a plan-funded promotion from one the owner paid for, so credits
-- can be counted per period without touching the owner's own promotions.
alter table promotions add column if not exists funded_by text not null default 'owner';
alter table promotions drop constraint if exists promotions_funded_by_check;
alter table promotions add constraint promotions_funded_by_check check (funded_by in ('owner', 'plan'));

-- LaundroMaster+ member discount is kept separate from store credit so the
-- two never contaminate each other's ledger.
alter table bookings add column if not exists member_discount_amount numeric not null default 0;

-- Platform-funded member discount rate (percent of the service subtotal).
insert into platform_settings (key, value) values
  ('customer_plus_discount_percent', '5'::jsonb)
on conflict (key) do nothing;

-- Plan copy: only promise what the platform enforces.
update plans set
  promotion_credits = 0,
  features = '["Public profile","Booking inbox","Earnings & payouts","1 branch"]'::jsonb
where code = 'owner_free';

update plans set
  promotion_credits = 1,
  features = '["Everything in Starter","Lower 4% take-rate","Up to 3 branches","1 free promoted listing each month"]'::jsonb
where code = 'owner_pro';

update plans set
  promotion_credits = 3,
  features = '["Everything in Pro","2% take-rate","Up to 10 branches","Consolidated multi-branch reporting","3 free promoted listings each month"]'::jsonb
where code = 'owner_chain';

update plans set
  promotion_credits = 0,
  features = '["Free pickup & delivery on every order","Members-only 5% discount on every order"]'::jsonb
where code = 'customer_plus';
