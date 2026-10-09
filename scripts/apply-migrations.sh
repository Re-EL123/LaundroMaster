#!/usr/bin/env bash
# Apply the LaundroMaster SQL migrations to a Supabase Postgres database.
#
# Usage:
#   DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
#     ./scripts/apply-migrations.sh
#
# The connection string is found in Supabase -> Project Settings -> Database ->
# "Connection string" (use the direct connection or the session pooler).
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: set DATABASE_URL (Postgres connection string)." >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for file in "$DIR"/supabase/migrations/*.sql; do
  echo "==> applying $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done

if [[ "${SEED:-}" == "1" ]]; then
  echo "==> seeding supabase/seed.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/seed.sql"
fi

echo "Done."
