#!/bin/sh
set -eu

require_value() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_value PARKMASTER_SUPABASE_URL
require_value PARKMASTER_PUBLISHABLE_KEY

case "$PARKMASTER_SUPABASE_URL" in
  https://*) ;;
  *) echo "PARKMASTER_SUPABASE_URL must use HTTPS." >&2; exit 1 ;;
esac

case "$PARKMASTER_PUBLISHABLE_KEY" in
  *[!A-Za-z0-9._-]*) echo "PARKMASTER_PUBLISHABLE_KEY contains invalid characters." >&2; exit 1 ;;
esac

write_json_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__PARKMASTER_CONFIG__ = Object.freeze({
  supabaseUrl: "$(write_json_string "$PARKMASTER_SUPABASE_URL")",
  supabasePublishableKey: "$(write_json_string "$PARKMASTER_PUBLISHABLE_KEY")",
  naverMapClientId: "$(write_json_string "${PARKMASTER_NAVER_MAP_CLIENT_ID:-}")",
  deploymentMode: "on_premises",
  externalAiEnabled: ${PARKMASTER_EXTERNAL_AI_ENABLED:-false},
  sensorConsoleUrl: "$(write_json_string "${PARKMASTER_SENSOR_CONSOLE_URL:-}")"
});
EOF

chmod 0444 /usr/share/nginx/html/runtime-config.js
exec nginx -g 'daemon off;'
