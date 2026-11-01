# Architecture

LaundroMaster is a three-app laundromat marketplace sharing one backend.

```
Customer App (GitHub Pages) ─┐
Owner App    (GitHub Pages) ─┼─ HTTPS ─> Vercel Serverless API (13 functions) ─┬─ Supabase Auth
Admin App    (GitHub Pages) ─┘                                                 ├─ Supabase PostgreSQL (RLS)
                                                                              ├─ Supabase Storage
                                                                              ├─ Supabase Realtime
                                                                              ├─ PayFast payments
                                                                              └─ Transactional email
```

## Deployment split
- **Frontend**: static HTML/CSS/ES modules deployed to GitHub Pages via `.github/workflows/deploy-gh-pages.yml`.
- **Backend**: Vercel Serverless Functions in `api/` (native routing).

## API entry points (13)
`auth`, `laundromats`, `bookings`, `payments`, `webhooks`, `uploads`, `reviews`,
`staff`, `notifications`, `ads`, `owner`, `admin`, `geo`.

Aggregate dashboards are served by `owner?action=analytics` and
`admin?action=analytics` (there is no standalone `analytics` function).

Shared helpers live in `api/_lib/` and are not separate functions.

## Nearby discovery
`/api/geo?action=search` is radius-bound by default (`radius_km`, default 25).
Coordinates come from the browser, a typed suburb/address (geocoded via Photon,
then Nominatim), or a saved profile address. Only listings inside the radius are
returned unless the caller passes `include_far=1`; `all=1` is the explicit
"browse every partner" escape hatch. `meta` reports `totalWithin`,
`totalOutside` and `totalUnknown` (approved listings without a map pin) so the
client can explain the result set instead of silently widening it. The customer
home page uses a fixed 25 km radius and never falls back to nationwide results.

## Request flow
1. Frontend obtains Supabase session (anon key).
2. Frontend calls the Vercel API with `Authorization: Bearer <access_token>`.
3. Function validates session, role and ownership, validates payload with Zod.
4. Function performs the operation with least-privilege credentials.
5. RLS provides a second layer of access control.
6. Consistent JSON envelope returned.

## Response envelope
```json
{ "ok": true, "data": {}, "error": null, "meta": { "requestId": "..." } }
```
Errors:
```json
{ "ok": false, "data": null, "error": { "code": "VALIDATION_ERROR", "message": "..." }, "meta": { "requestId": "..." } }
```
