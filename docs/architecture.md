# Architecture

LaundroMaster is a three-app laundromat marketplace sharing one backend.

```
Customer App (GitHub Pages) ─┐
Owner App    (GitHub Pages) ─┼─ HTTPS ─> Vercel Serverless API (12 functions) ─┬─ Supabase Auth
Admin App    (GitHub Pages) ─┘                                                 ├─ Supabase PostgreSQL (RLS)
                                                                              ├─ Supabase Storage
                                                                              ├─ Supabase Realtime
                                                                              ├─ iKhokha payments
                                                                              └─ Transactional email
```

## Deployment split
- **Frontend**: static HTML/CSS/ES modules deployed to GitHub Pages via `.github/workflows/deploy-gh-pages.yml`.
- **Backend**: Vercel Serverless Functions in `api/` (native routing). Max 12 entry points.

## API entry points (12)
`auth`, `laundromats`, `bookings`, `payments`, `webhooks`, `uploads`, `reviews`,
`notifications`, `owner`, `admin`, `analytics`, `geo`.

Shared helpers live in `api/_lib/` and are not separate functions.

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
