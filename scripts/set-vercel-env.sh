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
set_var IKHOKHA_API_KEY "$IKHOKHA_API_KEY"
set_var IKHOKHA_API_SECRET "$IKHOKHA_API_SECRET"
set_var IKHOKHA_WEBHOOK_SECRET "$IKHOKHA_WEBHOOK_SECRET"
set_var EMAIL_PROVIDER_API_KEY "$EMAIL_PROVIDER_API_KEY"
set_var APP_BASE_URL "${APP_BASE_URL:-https://re-el123.github.io/LaundroMaster}"
set_var OWNER_APP_URL "${OWNER_APP_URL:-https://re-el123.github.io/LaundroMaster/apps/owner}"
set_var ADMIN_APP_URL "${ADMIN_APP_URL:-https://re-el123.github.io/LaundroMaster/apps/admin}"
set_var ALLOWED_ORIGINS "${ALLOWED_ORIGINS:-https://re-el123.github.io}"

echo "Done. Redeploy with: vercel --prod"
