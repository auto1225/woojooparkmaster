#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="${PARKMASTER_RUNTIME_DIR:-$SOURCE_ROOT/deploy/runtime}"
SUPABASE_REPO_DIR="$RUNTIME_DIR/supabase"
SUPABASE_DIR="$SUPABASE_REPO_DIR/docker"
SUPABASE_ENV="$SUPABASE_DIR/.env"
OVERLAY_FILE="$SOURCE_ROOT/deploy/docker-compose.yml"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}
require_runtime() {
  if [ ! -f "$SUPABASE_DIR/docker-compose.yml" ] || [ ! -f "$SUPABASE_ENV" ]; then
    echo "ParkMaster runtime is not prepared. Run deploy/scripts/setup.sh first." >&2
    exit 1
  fi
}

read_env_value() {
  key="$1"
  file="${2:-$SUPABASE_ENV}"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

pm_compose() {
  docker compose \
    --project-directory "$SUPABASE_DIR" \
    -f "$SUPABASE_DIR/docker-compose.yml" \
    -f "$OVERLAY_FILE" \
    "$@"
}
