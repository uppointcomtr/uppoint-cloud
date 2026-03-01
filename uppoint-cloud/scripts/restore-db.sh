#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/uppoint-cloud/.env"
BACKUP_FILE="${1:-}"
CONFIRM_FLAG="${2:-}"

if [ -z "$BACKUP_FILE" ] || [ "$CONFIRM_FLAG" != "--confirm" ]; then
  echo "Usage: $0 <backup.sql.gz> --confirm" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore-db] backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d '=' -f2-)"
fi

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"
  DATABASE_URL="${DATABASE_URL#\'}"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[restore-db] DATABASE_URL is not set." >&2
  exit 1
fi

echo "[restore-db] taking pre-restore backup..."
/opt/uppoint-cloud/scripts/backup-db.sh

echo "[restore-db] validating archive..."
gzip -t "$BACKUP_FILE"

echo "[restore-db] restoring from $BACKUP_FILE"
gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"

echo "[restore-db] completed."
