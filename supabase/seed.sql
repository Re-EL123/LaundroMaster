-- LaundroMaster seed data (development)
insert into service_categories (name) values
  ('Wash'), ('Dry'), ('Iron'), ('Dry Cleaning'), ('Fold'), ('Other')
on conflict (name) do nothing;

insert into platform_settings (key, value) values
  ('commission_percent', '10'::jsonb),
  ('currency', '"ZAR"'::jsonb),
  ('market', '"ZA"'::jsonb)
on conflict (key) do nothing;
