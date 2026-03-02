#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
BACKUP_FILE="${1:-}"
CONFIRM_FLAG="${2:-}"
OPTIONAL_FLAG="${3:-}"
ALLOW_UNSIGNED=0

if [ -z "$BACKUP_FILE" ] || [ "$CONFIRM_FLAG" != "--confirm" ]; then
  echo "Usage: $0 <backup.sql.gz> --confirm [--allow-unsigned]" >&2
  exit 1
fi

if [ "$OPTIONAL_FLAG" = "--allow-unsigned" ]; then
  ALLOW_UNSIGNED=1
elif [ -n "$OPTIONAL_FLAG" ]; then
  echo "[restore-db] unknown option: $OPTIONAL_FLAG" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore-db] backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ -f "$CHECKSUM_FILE" ]; then
  if ! sha256sum -c "$CHECKSUM_FILE" >/dev/null 2>&1; then
    echo "[restore-db] checksum validation failed: $CHECKSUM_FILE" >&2
    exit 1
  fi
elif [ "$ALLOW_UNSIGNED" -ne 1 ]; then
  echo "[restore-db] missing checksum file: $CHECKSUM_FILE" >&2
  echo "[restore-db] use --allow-unsigned only for legacy backups" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[restore-db] DATABASE_URL is not set." >&2
  exit 1
fi
configure_postgres_connection "$DATABASE_URL"

echo "[restore-db] taking pre-restore backup..."
/opt/uppoint-cloud/scripts/backup-db.sh

echo "[restore-db] validating archive..."
gzip -t "$BACKUP_FILE"

echo "[restore-db] restoring from $BACKUP_FILE"
# Security-sensitive: avoid DATABASE_URL in argv; rely on PG* env connection settings.
gunzip -c "$BACKUP_FILE" | psql --set ON_ERROR_STOP=1

echo "[restore-db] completed."
