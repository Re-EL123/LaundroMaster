# Database

Provider: Supabase PostgreSQL. Schema lives in `supabase/migrations/`, seed in `supabase/seed.sql`.

## Tables
`profiles`, `user_roles`, `laundromats`, `laundromat_members`, `services`,
`service_categories`, `operating_hours`, `delivery_zones`, `bookings`,
`booking_items`, `booking_status_history`, `payments`, `refunds`, `reviews`,
`favorites`, `notifications`, `documents`, `staff_permissions`, `transactions`,
`withdrawals`, `admin_logs`, `platform_settings`.

## Conventions
- UUID primary keys, foreign keys, check constraints, timestamps.
- `numeric` for money (never floating point).
- Price snapshots on `booking_items` so historical bookings are immutable.
- Indexes on booking customer/laundromat/status/date, services (laundromat, active),
  reviews (laundromat, date), notifications (user, read state).

## Apply migrations
```bash
supabase db push        # or run 0001_init.sql in the SQL editor
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Row Level Security
RLS is enabled on client-exposed tables. Customers see only their own rows;
owners only their businesses; admins platform-wide. Service-role usage on the
server always re-checks auth, role, ownership and validation.
