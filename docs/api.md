# API Reference

Base path: `/api`. All responses use the envelope described in `architecture.md`.

| # | Endpoint | Methods | Purpose |
|---|----------|---------|---------|
| 1 | `/api/auth` | GET | Session/role bootstrap (`?action=me`) |
| 2 | `/api/laundromats` | GET | Public approved listings + business profile |
| 3 | `/api/bookings` | GET, POST | Create (`?action=create`), cancel, status transitions |
| 4 | `/api/payments` | GET, POST | Create payment session, status, refunds |
| 5 | `/api/webhooks` | POST | Provider-signed events, idempotent processing |
| 6 | `/api/uploads` | POST, GET | Signed uploads, short-lived download URLs |
| 7 | `/api/reviews` | GET, POST/PATCH | Submit + moderate reviews, rating aggregation |
| 8 | `/api/notifications` | GET, PATCH | List, read state, dispatch |
| 9 | `/api/owner` | GET, POST/PATCH | Dashboard, services, staff, hours, earnings |
| 10 | `/api/admin` | GET, POST/PATCH | Vetting, moderation, disputes, settings |
| 11 | `/api/analytics` | GET | Owner + admin aggregate metrics |
| 12 | `/api/geo` | GET | Radius search, distance, location validation |

## Conventions
- Validate all query params and bodies (Zod).
- Paginate list endpoints (`limit`, `cursor`/`offset`).
- Rate limit auth, search, reviews, payments.
- Never trust client-supplied price, role, ownership or payment status.
