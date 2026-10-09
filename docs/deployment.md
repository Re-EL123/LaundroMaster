# Deployment

## Environments
Development, staging and production each get their own Supabase project,
Vercel project and env vars.

## Environment variables (Vercel -> Project -> Settings -> Environment Variables)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
IKHOKHA_API_KEY=
IKHOKHA_API_SECRET=
IKHOKHA_WEBHOOK_SECRET=
EMAIL_PROVIDER_API_KEY=
APP_BASE_URL=https://laundromaster.re-el.co.za
OWNER_APP_URL=https://laundromaster.re-el.co.za/apps/owner
ADMIN_APP_URL=https://laundromaster.re-el.co.za/apps/admin
ALLOWED_ORIGINS=https://laundromaster.re-el.co.za,https://re-el123.github.io,http://localhost:3000
```

## Custom domain (laundromaster.re-el.co.za)
Frontend stays on GitHub Pages; only a DNS `CNAME` record is required:
```
CNAME  laundromaster  ->  re-el123.github.io
```
`dist/CNAME` is written by the Pages workflow and the domain is set on the
Pages site (HTTPS enforced). The API is unchanged (`laundromaster-sable.vercel.app`).

## Frontend (GitHub Pages)
Push to `main` runs `.github/workflows/deploy-gh-pages.yml`, which publishes
`apps/` and `shared/`, writes `dist/CNAME`, and adds a root `index.html` that
redirects to `apps/portal/index.html`. Each app reads its API base from
`js/config.js` (`window.API_BASE`).

## Authentication & roles
- `POST /api/auth?action=register|login|logout|refresh`, `GET /api/auth?action=me`.
- Roles: `customer`, `owner`, `staff`, `admin`, `super_admin`
  (`ROLE_PRIORITY` in `api/auth.js`); self-registration is limited to `customer`
  and `owner`, admin accounts are provisioned internally.
- `supabase/migrations/0002_auth_roles.sql` adds the `handle_new_user()` trigger
  and `current_user_role()` helper.
- Browser flow: `shared/js/auth-client.js` (session + refresh),
  `shared/js/guard.js` (route guard), `shared/js/session.js` (sign-out UI).

## Backend (Vercel)
1. Import the repo into Vercel (framework: Other).
2. Functions auto-detect from `api/*.js` (native routing, no legacy `builds`).
3. Set environment variables above.
4. Deploy: `vercel --prod`.
5. Note the production alias, e.g. `https://laundromaster-sable.vercel.app`.

## Steps
1. Create Supabase project, then apply the schema. Either:
   - paste the combined `supabase/apply-all.sql` into Supabase -> SQL Editor
     (simplest), or
   - run `supabase/migrations/0001_init.sql` then `0002_auth_roles.sql`
     (`supabase db push`, or `DATABASE_URL=... ./scripts/apply-migrations.sh`).
   Without this, API routes return `code:"PGRST205"` (table not found).
2. Create storage buckets: `avatars`, `laundromat-media`, `verification-documents`,
   `booking-attachments`, `receipts`, `platform-assets`.
3. Configure email provider and iKhokha sandbox + webhook secret.
4. Set env vars on Vercel; deploy.
5. Update `apps/*/js/config.js` with the Vercel API base; push (Pages redeploys).
6. Verify HTTPS, CORS, auth callback URLs and webhook endpoint.

## Bootstrapping the first admin
Self-registration only creates `customer` / `owner` roles. Promote an account in
the Supabase SQL editor:
```sql
-- replace with the target user id (from auth.users / profiles)
insert into user_roles (user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'admin')
on conflict (user_id, role) do nothing;
```
The user is an admin on their next login (role is resolved per request).
