#!/usr/bin/env bash
# Push LaundroMaster secrets to Vercel. Run from the repo root after `vercel link`.
# Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/set-vercel-env.sh
set -euo pipefail
ENVS=("production" "preview" "development")

set_var() {
  local name="$1" value="${2:-}"
  if [ -z "$value" ]; then echo "skip $name (empty)"; return; fi
  for e in "${ENVS[@]}"; do
    printf '%s' "$value" | vercel env add "$name" "$e" --force >/dev/null 2>&1 || true
  done
  echo "set $name"
}

set_var SUPABASE_URL "$SUPABASE_URL"
set_var SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
set_var SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
set_var IKHOKHA_APP_ID "${IKHOKHA_APP_ID:-${IKHOKHA_API_KEY:-}}"
set_var IKHOKHA_APP_SECRET "${IKHOKHA_APP_SECRET:-${IKHOKHA_API_SECRET:-}}"
set_var IKHOKHA_ENTITY_ID "$IKHOKHA_ENTITY_ID"
set_var IKHOKHA_MODE "${IKHOKHA_MODE:-test}"
set_var IKHOKHA_BASE_URL "${IKHOKHA_BASE_URL:-https://api.ikhokha.com}"
set_var IKHOKHA_WEBHOOK_SECRET "${IKHOKHA_WEBHOOK_SECRET:-${IKHOKHA_APP_SECRET:-${IKHOKHA_API_SECRET:-}}}"
set_var EMAIL_PROVIDER_API_KEY "$EMAIL_PROVIDER_API_KEY"
set_var APP_BASE_URL "${APP_BASE_URL:-https://laundromaster.re-el.co.za}"
set_var PUBLIC_APP_URL "${PUBLIC_APP_URL:-https://laundromaster.re-el.co.za}"
set_var API_PUBLIC_URL "${API_PUBLIC_URL:-https://laundromaster-sable.vercel.app}"
set_var OWNER_APP_URL "${OWNER_APP_URL:-https://laundromaster.re-el.co.za/apps/owner}"
set_var ADMIN_APP_URL "${ADMIN_APP_URL:-https://laundromaster.re-el.co.za/apps/admin}"
set_var ALLOWED_ORIGINS "${ALLOWED_ORIGINS:-https://laundromaster.re-el.co.za,https://re-el123.github.io,http://localhost:3000}"

echo "Done. Redeploy with: vercel --prod"
