#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -n "${PARKMASTER_CONFIG_FILE:-}" ]; then
  if [ ! -f "$PARKMASTER_CONFIG_FILE" ]; then
    echo "Configuration file not found: $PARKMASTER_CONFIG_FILE" >&2
    exit 1
  fi
  # The installation file is administrator-owned and must not be stored in Git.
  set -a
  # shellcheck disable=SC1090
  source "$PARKMASTER_CONFIG_FILE"
  set +a
fi

export PARKMASTER_RUNTIME_DIR="${PARKMASTER_RUNTIME_DIR:-$SOURCE_ROOT/deploy/runtime}"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

SUPABASE_GIT_REF="${SUPABASE_GIT_REF:-4c8ed105d2676b5ba4612b735fbdcf735fc30bcc}"
SUPABASE_GIT_URL="https://github.com/supabase/supabase.git"
PARKMASTER_HOSTNAME="${PARKMASTER_HOSTNAME:-}"
PARKMASTER_BIND_ADDRESS="${PARKMASTER_BIND_ADDRESS:-0.0.0.0}"
PARKMASTER_PUBLIC_URL="https://${PARKMASTER_HOSTNAME}"
PARKMASTER_TLS_DIR="${PARKMASTER_TLS_DIR:-$RUNTIME_DIR/tls}"

require_command git
require_command docker
require_command openssl

if [ -z "$PARKMASTER_HOSTNAME" ]; then
  echo "PARKMASTER_HOSTNAME is required (for example, parkmaster.agency.local)." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

compose_version="$(docker compose version --short | sed 's/^v//; s/[^0-9.].*$//')"
minimum_compose_version="2.24.4"
if [ "$(printf '%s\n%s\n' "$minimum_compose_version" "$compose_version" | sort -V | head -n 1)" != "$minimum_compose_version" ]; then
  echo "Docker Compose $minimum_compose_version or newer is required (found $compose_version)." >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR" "$PARKMASTER_TLS_DIR"

if [ ! -d "$SUPABASE_REPO_DIR/.git" ]; then
  git clone --filter=blob:none --sparse "$SUPABASE_GIT_URL" "$SUPABASE_REPO_DIR"
  git -C "$SUPABASE_REPO_DIR" sparse-checkout set docker
fi

git -C "$SUPABASE_REPO_DIR" fetch --depth 1 origin "$SUPABASE_GIT_REF"
git -C "$SUPABASE_REPO_DIR" checkout --detach "$SUPABASE_GIT_REF"

if [ ! -f "$SUPABASE_ENV" ]; then
  cp "$SUPABASE_DIR/.env.example" "$SUPABASE_ENV"
  (
    cd "$SUPABASE_DIR"
    sh utils/generate-keys.sh
    sh utils/add-new-auth-keys.sh
  )
fi

set_env_value() {
  key="$1"
  value="$2"
  escaped="$(printf '%s' "$value" | sed 's/[&|]/\\&/g')"
  if grep -q "^${key}=" "$SUPABASE_ENV"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$SUPABASE_ENV"
  else
    printf '%s=%s\n' "$key" "$value" >> "$SUPABASE_ENV"
  fi
}

set_env_value SUPABASE_PUBLIC_URL "$PARKMASTER_PUBLIC_URL"
set_env_value API_EXTERNAL_URL "$PARKMASTER_PUBLIC_URL/auth/v1"
set_env_value SITE_URL "$PARKMASTER_PUBLIC_URL"
set_env_value ADDITIONAL_REDIRECT_URLS "$PARKMASTER_PUBLIC_URL/**"
set_env_value DISABLE_SIGNUP "true"
set_env_value ENABLE_EMAIL_AUTOCONFIRM "true"
set_env_value KONG_HTTP_PORT "18000"
set_env_value KONG_HTTPS_PORT "18443"
set_env_value POSTGRES_PORT "15432"
set_env_value POOLER_PROXY_PORT_TRANSACTION "16543"
set_env_value PARKMASTER_SOURCE_DIR "$SOURCE_ROOT"
set_env_value PARKMASTER_TLS_DIR "$PARKMASTER_TLS_DIR"
set_env_value PARKMASTER_PUBLIC_URL "$PARKMASTER_PUBLIC_URL"
set_env_value PARKMASTER_BIND_ADDRESS "$PARKMASTER_BIND_ADDRESS"
set_env_value NAVER_MAP_CLIENT_ID "${NAVER_MAP_CLIENT_ID:-}"
set_env_value NAVER_MAP_CLIENT_SECRET "${NAVER_MAP_CLIENT_SECRET:-}"
set_env_value AI_ENABLED "${AI_ENABLED:-false}"
set_env_value AI_GATEWAY_URL "${AI_GATEWAY_URL:-}"
set_env_value AI_API_KEY "${AI_API_KEY:-}"
set_env_value AI_MODEL "${AI_MODEL:-}"
set_env_value AI_ALLOWED_HOSTS "${AI_ALLOWED_HOSTS:-}"
set_env_value SENSOR_CONSOLE_URL "${SENSOR_CONSOLE_URL:-}"
set_env_value BACKUP_ENCRYPTION_KEY_FILE "${BACKUP_ENCRYPTION_KEY_FILE:-/etc/parkmaster/backup.key}"
set_env_value BACKUP_RETENTION_DAYS "${BACKUP_RETENTION_DAYS:-90}"

if [ ! -s "$PARKMASTER_TLS_DIR/cert.pem" ] || [ ! -s "$PARKMASTER_TLS_DIR/key.pem" ]; then
  if [ "${PARKMASTER_ALLOW_SELF_SIGNED:-false}" = "true" ]; then
    openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 \
      -subj "/CN=$PARKMASTER_HOSTNAME" \
      -addext "subjectAltName=DNS:$PARKMASTER_HOSTNAME" \
      -keyout "$PARKMASTER_TLS_DIR/key.pem" \
      -out "$PARKMASTER_TLS_DIR/cert.pem"
    chmod 0600 "$PARKMASTER_TLS_DIR/key.pem"
  else
    echo "Install the agency TLS certificate at $PARKMASTER_TLS_DIR/cert.pem and key.pem." >&2
    echo "For a temporary test only, set PARKMASTER_ALLOW_SELF_SIGNED=true." >&2
    exit 1
  fi
fi

for function_name in ai-assistant geocode-lots; do
  rm -rf "$SUPABASE_DIR/volumes/functions/$function_name"
  cp -R "$SOURCE_ROOT/supabase/functions/$function_name" "$SUPABASE_DIR/volumes/functions/$function_name"
done

pm_compose pull
pm_compose up -d --build --wait
bash "$SCRIPT_DIR/migrate.sh"

echo "ParkMaster is running at $PARKMASTER_PUBLIC_URL"
echo "Create the first administrator with deploy/scripts/create-admin.sh."
