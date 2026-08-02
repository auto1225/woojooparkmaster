#!/usr/bin/env bash
set -Eeuo pipefail

INTERNAL_CIDR="${PARKMASTER_INTERNAL_CIDR:-}"
MANAGEMENT_CIDR="${PARKMASTER_MANAGEMENT_CIDR:-$INTERNAL_CIDR}"

if [ -z "$INTERNAL_CIDR" ]; then
  echo "PARKMASTER_INTERNAL_CIDR is required." >&2
  exit 1
fi

if ! command -v ufw >/dev/null 2>&1; then
  echo "ufw is required on the target Linux server." >&2
  exit 1
fi

ufw default deny incoming
ufw allow from "$MANAGEMENT_CIDR" to any port 22 proto tcp comment 'ParkMaster administration'
ufw allow from "$INTERNAL_CIDR" to any port 80 proto tcp comment 'ParkMaster HTTPS redirect'
ufw allow from "$INTERNAL_CIDR" to any port 443 proto tcp comment 'ParkMaster application'
ufw deny 5432/tcp
ufw deny 6543/tcp
ufw deny 8000/tcp
ufw deny 8443/tcp
ufw --force enable
ufw status verbose
