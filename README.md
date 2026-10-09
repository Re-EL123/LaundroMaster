# LaundroMaster

Premium laundromat marketplace: **Customer**, **Owner** and **Admin** web apps
with a Supabase backend, deployed as **static frontend on GitHub Pages** and
**serverless API on Vercel**.

- **Frontend (GitHub Pages):** https://laundromaster.re-el.co.za (portal at `/apps/portal/`)
- **API (Vercel):** https://laundromaster-sable.vercel.app/api

> All credentials and keys are read from environment variables. Nothing secret
> is committed. See `.env.example`.

## Stack
HTML5 · CSS3 · Vanilla JS ES modules · Vercel Serverless Functions (max 12) ·
Supabase Auth/PostgreSQL/Storage/Realtime · iKhokha payments (via API).

## Layout
```
apps/        customer, owner, admin, portal static apps
shared/      css design tokens + js modules (api-client, auth-client, guard, session, dom)
api/         12 serverless entry points + _lib helpers
supabase/    migrations + seed
docs/        architecture, api, database, security, deployment
tests/       unit tests
```

## Local development
```bash
cp .env.example .env      # fill in values
npm install
npm test
npx serve .               # serve frontend locally
```

For local API, run `vercel dev`.

## Authentication
Role-based sign-in at `/apps/portal/` routes users to their app:
`customer`, `owner` (and `staff`), or `admin`/`super_admin`. Sessions are stored
in `localStorage` and refreshed automatically; server-side RLS + `authz.js`
remain authoritative. See `docs/deployment.md`.

## Backend routing
Functions auto-detect from `api/*.js` (`auth`, `laundromats`, `bookings`,
`payments`, `webhooks`, `uploads`, `reviews`, `notifications`, `owner`,
`admin`, `analytics`, `geo`). `api/_lib/` are helper modules, not routes.

## Deployment
- **API:** `vercel --prod` (set env vars first). See `docs/deployment.md`.
- **Frontend:** push to `main`; `.github/workflows/deploy-gh-pages.yml` publishes
  `apps/` + `shared/`. Each app points at the API via `apps/*/js/config.js`.

## Response envelope
```json
{ "ok": true, "data": {}, "error": null, "meta": { "requestId": "..." } }
```

See `docs/` for the full specification and security model.
