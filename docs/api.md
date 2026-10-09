# API Reference

Base path: `/api`. All responses use the envelope described in `architecture.md`.

Authentication uses `Authorization: Bearer <access_token>` obtained from
`/api/auth?action=login`. Endpoints marked **Auth** require a valid token;
**Owner**/**Admin** require the matching role.

| # | Endpoint | Methods | Actions / Notes |
|---|----------|---------|-----------------|
| 1 | `/api/auth` | GET, POST | `login`, `register`, `logout`, `refresh`, `update-profile` (Auth), `me` (Auth, GET) |
| 2 | `/api/laundromats` | GET, POST | list (`?q=&limit=&offset=`), `?id=`, `?action=services&id=`, `?action=favorites` (Auth), `?action=favorite` (Auth, POST toggles) |
| 3 | `/api/bookings` | GET, POST | list (scoped by role), `?id=`, `?action=create` (Auth), `?action=update-status` (Owner), `?action=cancel` (Auth) |
| 4 | `/api/payments` | GET, POST | `?booking_id=`/`?id=` (Auth), `?action=create` (Auth) |
| 5 | `/api/webhooks` | POST | iKhokha signed events, idempotent processing |
| 6 | `/api/uploads` | GET, POST | `?action=sign` (Auth), signed download (`?bucket=&path=`) |
| 7 | `/api/reviews` | GET, POST | list (`?laundromat_id=`), create (Auth) |
| 8 | `/api/notifications` | GET, PATCH, POST | list (Auth), `PATCH ?id=` mark read, `?action=read-all` |
| 9 | `/api/owner` | GET, POST | `stats`, `services`, `earnings`, `laundromats` (Owner); `service-create`, `service-update`, `service-delete` |
| 10 | `/api/admin` | GET, POST | `stats`, `laundromats`, `verifications`, `users`, `audit` (Admin); `verify` (Admin) |
| 11 | `/api/analytics` | GET | `?scope=owner|admin` aggregate metrics |
| 12 | `/api/geo` | GET | `?action=search&lat=&lng=&radius_km=` radius search |

## Conventions
- Validate all query params and bodies (Zod, `api/_lib/validation.js`).
- List endpoints paginate with `limit` (and `offset` where applicable).
- Never trust client-supplied price, role, ownership or payment status: totals
  are recomputed from `services`, roles come from `user_roles`, ownership is
  checked per request (`api/_lib/auth.js`).
- Supabase-backed routes return `503 NOT_CONFIGURED` until env vars are set.
