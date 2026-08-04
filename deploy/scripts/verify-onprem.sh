#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
require_command curl
require_command docker
require_runtime

public_url="$(read_env_value PARKMASTER_PUBLIC_URL)"
ai_enabled="$(read_env_value AI_ENABLED)"
failed=0

check() {
  label="$1"
  shift
  if "$@"; then
    printf '[PASS] %s\n' "$label"
  else
    printf '[FAIL] %s\n' "$label" >&2
    failed=1
  fi
}

all_healthy() {
  unhealthy="$(pm_compose ps --format json | grep -E '"Health":"(unhealthy|starting)"|"State":"(exited|dead)"' || true)"
  [ -z "$unhealthy" ]
}

loopback_only() {
  service="$1"
  internal_port="$2"
  bindings="$(pm_compose port "$service" "$internal_port" 2>/dev/null || true)"
  [ -n "$bindings" ] && ! printf '%s' "$bindings" | grep -Evq '^(127\.0\.0\.1|\[::1\]):'
}

https_responds() {
  curl --fail --silent --show-error --max-time 10 "$public_url/health" >/dev/null
}

security_headers_present() {
  headers="$(curl --fail --silent --show-error --head --max-time 10 "$public_url/")"
  printf '%s' "$headers" | grep -qi '^strict-transport-security:' \
    && printf '%s' "$headers" | grep -qi '^content-security-policy:' \
    && printf '%s' "$headers" | grep -qi '^x-content-type-options:'
}

migrations_present() {
  count="$(pm_compose exec -T db psql -U postgres -d postgres -tAc \
    'SELECT count(*) FROM parkmaster_admin.schema_migrations' 2>/dev/null || echo 0)"
  [ "${count:-0}" -gt 0 ]
}

check "containers are healthy" all_healthy
check "ParkMaster HTTPS health endpoint responds" https_responds
check "security headers are enabled" security_headers_present
check "Kong HTTP is bound to loopback" loopback_only kong 8000
check "Kong HTTPS is bound to loopback" loopback_only kong 8443
check "Postgres session port is bound to loopback" loopback_only supavisor 5432
check "database migrations are recorded" migrations_present

if [ "$ai_enabled" = "true" ]; then
  echo "[REVIEW] External AI is enabled. Confirm the security approval and exact host allowlist."
else
  echo "[PASS] External AI is disabled by default"
fi

exit "$failed"
