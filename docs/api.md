# API Reference

Base path: `/api`. All responses use the envelope described in `architecture.md`.

Authentication uses `Authorization: Bearer <access_token>` obtained from
`/api/auth?action=login`. Endpoints marked **Auth** require a valid token;
**Owner**/**Admin** require the matching role.

| # | Endpoint | Methods | Actions / Notes |
|---|----------|---------|-----------------|
| 1 | `/api/auth` | GET, POST | `login`, `register`, `logout`, `refresh`, `update-profile` (Auth), `me` (Auth, GET) |
| 2 | `/api/laundromats` | GET, POST | list (`?q=&limit=&offset=`), `?id=`, `?action=services&id=`, `?action=favorites` (Auth), `?action=favorite` (Auth, POST toggles) |
| 3 | `/api/bookings` | GET, POST | list (scoped by role), `?id=`, `?action=quote` (Auth, price preview), `?action=create` (Auth), `?action=update-status` (Owner), `?action=cancel` (Auth), `?action=request-refund` (Auth), `?action=redeem-points` (Auth) |
| 4 | `/api/payments` | GET, POST | `?booking_id=`/`?id=` (Auth), `?action=payment&id=` (Auth); `?action=plans&audience=` (Auth), `?action=subscription&audience=` (Auth), `?action=savings` (Auth); POST `?action=create` (Auth, `booking_id`) → hosted PayFast checkout, `?action=subscribe` (Auth, `plan_id`), `?action=verify` (Auth, `payment_id`), `?action=cancel-subscription` (Auth, `audience`) |
| 5 | `/api/webhooks` | POST | PayFast ITN (MD5 signature, amount + server validation), idempotent processing |
| 6 | `/api/uploads` | GET, POST | `?action=sign` (Auth), signed download (`?bucket=&path=`) |
| 7 | `/api/reviews` | GET, POST | list (`?laundromat_id=`), create (Auth); admin `?action=pending|all`, POST `?action=moderate|delete` |
| 8 | `/api/staff` | GET, POST | `?action=invites` (Auth), POST `?action=respond` (Auth, `member_id`, `decision=accept|decline`) |
| 9 | `/api/notifications` | GET, PATCH, POST | list (Auth), `PATCH ?id=` mark read, `?action=read-all` |
| 10 | `/api/ads` | GET, POST | active ads by `?placement=`; `?action=impression|click` counters |
| 11 | `/api/owner` | GET, POST | `stats`, `analytics`, `services`, `earnings`, `laundromats`, `branding`, `team`, `plan`, `promotions`, `payouts`, `customers` (Owner); `service-create`, `service-update`, `service-delete`, `promote`, `payout-request`, `staff-invite`, `staff-update`, `staff-remove`, `laundromat-update` |
| 12 | `/api/admin` | GET, POST | `stats` (incl. GMV, MRR, platform revenue), `analytics`, `laundromats`, `verifications`, `users`, `commissions`, `payouts`, `refunds`, `promotions`, `plans`, `subscriptions`, `settings`, `audit` (Admin); `verify`, `settings-update`, `plan-upsert`, `plan-toggle`, `user-update`, `user-roles`, `laundromat-update`, `payout-update`, `refund-update`, `promotion-update`, `commission-update`, `broadcast` |
| 13 | `/api/geo` | GET, POST | `?action=search&lat=&lng=&radius_km=&q=` (geocode fallback + distance ranking; strict radius by default — `include_far=1` opts into farther results, `all=1` lists every approved partner), `?action=geocode&q=`, `?action=places&q=&limit=` (address autocomplete — several Photon/Nominatim candidates, most precise first), `?action=reverse&lat=&lng=`, `?action=backfill` (Admin, POST) |

## Conventions
- Validate all query params and bodies (Zod, `api/_lib/validation.js`).
- List endpoints paginate with `limit` (and `offset` where applicable).
- Never trust client-supplied price, role, ownership or payment status: totals
  are recomputed from `services`, roles come from `user_roles`, ownership is
  checked per request (`api/_lib/auth.js`).
- Supabase-backed routes return `503 NOT_CONFIGURED` until env vars are set.
