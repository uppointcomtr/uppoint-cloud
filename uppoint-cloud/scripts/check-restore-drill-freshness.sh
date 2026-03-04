#!/usr/bin/env bash
set -euo pipefail

CRON_FILE="/etc/cron.d/uppoint-postgres-restore-drill"
LOG_FILE="/var/log/uppoint-postgres-restore-drill.log"
MAX_AGE_HOURS_RAW="${RESTORE_DRILL_FRESHNESS_MAX_HOURS:-192}"

if ! [[ "$MAX_AGE_HOURS_RAW" =~ ^[0-9]+$ ]] || [ "$MAX_AGE_HOURS_RAW" -lt 1 ]; then
  MAX_AGE_HOURS=192
else
  MAX_AGE_HOURS="$MAX_AGE_HOURS_RAW"
fi

if [ ! -f "$CRON_FILE" ]; then
  echo "[restore-drill-freshness] skip ($CRON_FILE not present)"
  exit 0
fi

if [ ! -f "$LOG_FILE" ]; then
  echo "[restore-drill-freshness] FAIL missing log file: $LOG_FILE" >&2
  exit 1
fi

NOW_EPOCH="$(date +%s)"
LOG_MTIME_EPOCH="$(stat -c %Y "$LOG_FILE")"
AGE_SECONDS=$((NOW_EPOCH - LOG_MTIME_EPOCH))
AGE_HOURS=$((AGE_SECONDS / 3600))

if [ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]; then
  echo "[restore-drill-freshness] FAIL stale log: age=${AGE_HOURS}h max=${MAX_AGE_HOURS}h file=${LOG_FILE}" >&2
  exit 1
fi

echo "[restore-drill-freshness] OK age=${AGE_HOURS}h max=${MAX_AGE_HOURS}h file=${LOG_FILE}"
