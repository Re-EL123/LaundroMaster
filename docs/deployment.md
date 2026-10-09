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
APP_BASE_URL=
OWNER_APP_URL=
ADMIN_APP_URL=
ALLOWED_ORIGINS=https://re-el123.github.io,http://localhost:3000
```

## Frontend (GitHub Pages)
Push to `main` runs `.github/workflows/deploy-gh-pages.yml`, which publishes
`apps/` and `shared/`. Each app reads its API base from `js/config.js`
(`window.API_BASE`).

## Backend (Vercel)
1. Import the repo into Vercel (framework: Other).
2. Functions auto-detect from `api/*.js` (native routing, no legacy `builds`).
3. Set environment variables above.
4. Deploy: `vercel --prod`.
5. Note the production alias, e.g. `https://laundromaster-sable.vercel.app`.

## Steps
1. Create Supabase project; run `supabase/migrations/0001_init.sql`.
2. Create storage buckets: `avatars`, `laundromat-media`, `verification-documents`,
   `booking-attachments`, `receipts`, `platform-assets`.
3. Configure email provider and iKhokha sandbox + webhook secret.
4. Set env vars on Vercel; deploy.
5. Update `apps/*/js/config.js` with the Vercel API base; push (Pages redeploys).
6. Verify HTTPS, CORS, auth callback URLs and webhook endpoint.
