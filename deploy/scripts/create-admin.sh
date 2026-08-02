#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
require_command curl
require_command jq
require_runtime

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_NAME="${ADMIN_NAME:-ParkMaster 관리자}"

if [ -z "$ADMIN_EMAIL" ]; then
  read -r -p "Administrator email: " ADMIN_EMAIL
fi
if [ -z "$ADMIN_PASSWORD" ]; then
  read -r -s -p "Administrator password (12+ characters): " ADMIN_PASSWORD
  echo
fi
if [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
  echo "Administrator password must contain at least 12 characters." >&2
  exit 1
fi

service_key="$(read_env_value SERVICE_ROLE_KEY)"
kong_port="$(read_env_value KONG_HTTP_PORT)"
payload="$(jq -n \
  --arg email "$ADMIN_EMAIL" \
  --arg password "$ADMIN_PASSWORD" \
  --arg name "$ADMIN_NAME" \
  '{email:$email,password:$password,email_confirm:true,user_metadata:{name:$name,team:"admin",role:"admin"}}')"

curl --fail-with-body --silent --show-error \
  -X POST "http://127.0.0.1:${kong_port}/auth/v1/admin/users" \
  -H "apikey: ${service_key}" \
  -H "Authorization: Bearer ${service_key}" \
  -H "Content-Type: application/json" \
  --data "$payload" >/dev/null

echo "Administrator account created: $ADMIN_EMAIL"
