#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
BACKUP_DIR="/opt/backups/postgres"
CHECK_ONLY=0
EXECUTE=0
CONFIRMED=0
KEEP_DB=0
DRILL_DB_NAME=""

usage() {
  cat <<'EOF'
Usage:
  restore-drill-db.sh --check-only
  restore-drill-db.sh --execute --confirm [--keep-db] [--db-name <name>]

Notes:
  --check-only validates backup artifacts without creating a drill database.
  --execute requires --confirm and performs full restore drill to a temporary DB.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      ;;
    --execute)
      EXECUTE=1
      ;;
    --confirm)
      CONFIRMED=1
      ;;
    --keep-db)
      KEEP_DB=1
      ;;
    --db-name)
      shift
      if [ "$#" -eq 0 ]; then
        echo "[restore-drill] missing value for --db-name" >&2
        exit 1
      fi
      DRILL_DB_NAME="$1"
      ;;
    *)
      echo "[restore-drill] unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [ "$CHECK_ONLY" -eq 0 ] && [ "$EXECUTE" -eq 0 ]; then
  echo "[restore-drill] either --check-only or --execute is required." >&2
  usage
  exit 1
fi

if [ "$CHECK_ONLY" -eq 1 ] && [ "$EXECUTE" -eq 1 ]; then
  echo "[restore-drill] choose either --check-only or --execute, not both." >&2
  exit 1
fi

if [ "$EXECUTE" -eq 1 ] && [ "$CONFIRMED" -ne 1 ]; then
  echo "[restore-drill] --execute requires --confirm." >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-$(read_env_value "$ENV_FILE" "DATABASE_URL")}"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[restore-drill] DATABASE_URL is not set." >&2
  exit 1
fi

configure_postgres_connection "$DATABASE_URL"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "[restore-drill] backup directory not found: $BACKUP_DIR" >&2
  exit 1
fi

LATEST_BACKUP="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' -printf '%T@ %p\n' | sort -nr | awk 'NR==1{print $2}')"
if [ -z "${LATEST_BACKUP:-}" ]; then
  echo "[restore-drill] no backup file found under $BACKUP_DIR" >&2
  exit 1
fi

CHECKSUM_FILE="${LATEST_BACKUP}.sha256"
if [ ! -f "$CHECKSUM_FILE" ]; then
  echo "[restore-drill] checksum file missing: $CHECKSUM_FILE" >&2
  exit 1
fi

sha256sum -c "$CHECKSUM_FILE" >/dev/null
gzip -t "$LATEST_BACKUP"

echo "[restore-drill] latest backup OK: $LATEST_BACKUP"

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "[restore-drill] check-only completed."
  exit 0
fi

if ! command -v createdb >/dev/null 2>&1 || ! command -v dropdb >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  echo "[restore-drill] required postgres client binaries (createdb/dropdb/psql) not found." >&2
  exit 1
fi

if [ -z "$DRILL_DB_NAME" ]; then
  DRILL_DB_NAME="restore_drill_$(date +%Y%m%d_%H%M%S)"
fi

cleanup() {
  if [ "$KEEP_DB" -eq 1 ]; then
    return
  fi

  dropdb --if-exists "$DRILL_DB_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "[restore-drill] creating drill database: $DRILL_DB_NAME"
createdb "$DRILL_DB_NAME"

echo "[restore-drill] restoring backup into drill database..."
gunzip -c "$LATEST_BACKUP" | psql --set ON_ERROR_STOP=1 --dbname "$DRILL_DB_NAME" >/dev/null

TABLE_COUNT="$(psql --no-psqlrc -At --dbname "$DRILL_DB_NAME" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")"
if ! [[ "$TABLE_COUNT" =~ ^[0-9]+$ ]]; then
  echo "[restore-drill] table count query returned invalid output: $TABLE_COUNT" >&2
  exit 1
fi

if [ "$TABLE_COUNT" -lt 1 ]; then
  echo "[restore-drill] restore drill failed: no public tables restored." >&2
  exit 1
fi

echo "[restore-drill] restore drill succeeded: restored tables=$TABLE_COUNT"
if [ "$KEEP_DB" -eq 1 ]; then
  echo "[restore-drill] --keep-db active; drill database retained: $DRILL_DB_NAME"
fi
