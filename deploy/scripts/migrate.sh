#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
require_command docker
require_runtime

pm_compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS parkmaster_admin;
REVOKE ALL ON SCHEMA parkmaster_admin FROM PUBLIC;
CREATE TABLE IF NOT EXISTS parkmaster_admin.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

while IFS= read -r migration; do
  version="$(basename "$migration" .sql)"
  applied="$(pm_compose exec -T db psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM parkmaster_admin.schema_migrations WHERE version = '$version'")"
  if [ "$applied" = "1" ]; then
    echo "Already applied: $version"
    continue
  fi

  if [ "$version" = "20260730101000_jeju_paid_parking_rebuild" ]; then
    existing_lot_count="$(pm_compose exec -T db psql -U postgres -d postgres -tAc \
      "SELECT count(*) FROM public.parking_lots")"
    if [ "${existing_lot_count:-0}" -gt 0 ] && [ "${PARKMASTER_CONFIRM_JEJU_REBUILD:-}" != "JEJU_2025_112" ]; then
      echo "The Jeju 2025 survey migration will replace $existing_lot_count parking lots and all lot-dependent rows." >&2
      echo "Create an encrypted backup, then rerun with PARKMASTER_CONFIRM_JEJU_REBUILD=JEJU_2025_112." >&2
      exit 1
    fi
  fi

  echo "Applying: $version"
  {
    cat "$migration"
    printf "\nINSERT INTO parkmaster_admin.schema_migrations(version) VALUES ('%s');\n" "$version"
  } | pm_compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction
done < <(find "$SOURCE_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | sort)

pm_compose exec -T db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';" >/dev/null
echo "All ParkMaster migrations are applied."
