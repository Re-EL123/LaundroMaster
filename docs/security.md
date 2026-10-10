# Security

## Secrets (server-side only)
`SUPABASE_SERVICE_ROLE_KEY`, `IKHOKHA_APP_ID`, `IKHOKHA_APP_SECRET`,
`IKHOKHA_ENTITY_ID`, `IKHOKHA_WEBHOOK_SECRET`, `EMAIL_PROVIDER_API_KEY`,
`ADMIN_TOKEN`.
Never expose these to the browser. Only `SUPABASE_URL` and `SUPABASE_ANON_KEY`
are publishable, and only with RLS correctly configured.

## Every protected operation
1. Verify the session/token server-side.
2. Load role and account status from trusted data.
3. Check the action against the role.
4. Check ownership/membership of the target resource.
5. Validate all inputs (Zod).
6. Execute with least privilege.
7. Record sensitive actions in `admin_logs`.

## API hardening
- Safe CORS allow-list (`ALLOWED_ORIGINS`).
- Request-body size limits and timeouts.
- Parameterised DB access via the Supabase client.
- No stack traces, secrets or raw SQL in responses.
- Rate limiting on auth, search, reviews, payments.

## Payments
Confirm payment state only through verified server-to-server provider evidence.
Idempotency keys prevent duplicate charges and ledger entries. Never store card
numbers or CVV.

## Files
Private buckets for identity/business documents. Signed, short-lived links only.
Randomised object names. Type/size validation server-side.

## POPIA
Define lawful purpose, restrict access, set retention/deletion procedures and
publish privacy notices. Obtain qualified legal advice for final policies.
