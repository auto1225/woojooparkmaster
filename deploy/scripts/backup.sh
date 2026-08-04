#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
require_command docker
require_command openssl
require_command tar
require_runtime

BACKUP_DIR="${PARKMASTER_BACKUP_DIR:-$RUNTIME_DIR/backups}"
key_file="${BACKUP_ENCRYPTION_KEY_FILE:-$(read_env_value BACKUP_ENCRYPTION_KEY_FILE)}"
retention_days="${BACKUP_RETENTION_DAYS:-$(read_env_value BACKUP_RETENTION_DAYS)}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -z "$key_file" ] || [ ! -f "$key_file" ]; then
  echo "Backup encryption key file is missing." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
work_dir="$(mktemp -d "$BACKUP_DIR/.parkmaster-backup.XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT

pm_compose exec -T db pg_dump -U postgres -d postgres -Fc > "$work_dir/database.dump"
tar -C "$SUPABASE_DIR/volumes/storage" -czf "$work_dir/storage.tar.gz" .
sha256sum "$work_dir/database.dump" "$work_dir/storage.tar.gz" > "$work_dir/SHA256SUMS"
tar -C "$work_dir" -czf "$work_dir/parkmaster-$timestamp.tar.gz" database.dump storage.tar.gz SHA256SUMS

openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$work_dir/parkmaster-$timestamp.tar.gz" \
  -out "$BACKUP_DIR/parkmaster-$timestamp.tar.gz.enc" \
  -pass "file:$key_file"
chmod 0600 "$BACKUP_DIR/parkmaster-$timestamp.tar.gz.enc"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'parkmaster-*.tar.gz.enc' -mtime "+${retention_days:-90}" -delete
echo "Encrypted backup created: $BACKUP_DIR/parkmaster-$timestamp.tar.gz.enc"
