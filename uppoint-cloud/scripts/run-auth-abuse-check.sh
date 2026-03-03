#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
STATE_DIR="/var/lib/uppoint-cloud"
STATE_FILE="${STATE_DIR}/auth-abuse-alert.state"
DEFAULT_COOLDOWN_MINUTES=60

AUTH_ABUSE_ALERT_COOLDOWN_MINUTES="${AUTH_ABUSE_ALERT_COOLDOWN_MINUTES:-}"

if [ -z "$AUTH_ABUSE_ALERT_COOLDOWN_MINUTES" ]; then
  AUTH_ABUSE_ALERT_COOLDOWN_MINUTES="$(read_env_value "$ENV_FILE" "AUTH_ABUSE_ALERT_COOLDOWN_MINUTES")"
fi
AUTH_ABUSE_ALERT_COOLDOWN_MINUTES="${AUTH_ABUSE_ALERT_COOLDOWN_MINUTES:-$DEFAULT_COOLDOWN_MINUTES}"

if ! [[ "$AUTH_ABUSE_ALERT_COOLDOWN_MINUTES" =~ ^[0-9]+$ ]] || [ "$AUTH_ABUSE_ALERT_COOLDOWN_MINUTES" -lt 1 ]; then
  echo "[auth-abuse-check] invalid cooldown: ${AUTH_ABUSE_ALERT_COOLDOWN_MINUTES}" >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-}"
AUDIT_LOG_SIGNING_SECRET="${AUDIT_LOG_SIGNING_SECRET:-}"
AUTH_SECRET="${AUTH_SECRET:-}"

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi
if [ -z "$AUDIT_LOG_SIGNING_SECRET" ]; then
  AUDIT_LOG_SIGNING_SECRET="$(read_env_value "$ENV_FILE" "AUDIT_LOG_SIGNING_SECRET")"
fi
if [ -z "$AUTH_SECRET" ]; then
  AUTH_SECRET="$(read_env_value "$ENV_FILE" "AUTH_SECRET")"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[auth-abuse-check] DATABASE_URL is not set." >&2
  exit 1
fi

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

TMP_REPORT="$(mktemp)"
trap 'rm -f "$TMP_REPORT"' EXIT

run_started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
set +e
DATABASE_URL="$DATABASE_URL" AUDIT_LOG_SIGNING_SECRET="$AUDIT_LOG_SIGNING_SECRET" AUTH_SECRET="$AUTH_SECRET" node "${SCRIPT_DIR}/check-auth-abuse-signals.mjs" >"$TMP_REPORT" 2>&1
CHECK_STATUS=$?
set -e

if [ "$CHECK_STATUS" -eq 0 ]; then
  echo "[${run_started_at}] [auth-abuse-check] result=ok"
  cat "$TMP_REPORT"
  exit 0
fi

echo "[${run_started_at}] [auth-abuse-check] result=alert"
cat "$TMP_REPORT"

current_hash="$(sha256sum "$TMP_REPORT" | awk '{print $1}')"
now_epoch="$(date +%s)"
cooldown_seconds=$((AUTH_ABUSE_ALERT_COOLDOWN_MINUTES * 60))

previous_hash=""
previous_epoch=0
if [ -f "$STATE_FILE" ]; then
  previous_hash="$(awk '{print $1}' "$STATE_FILE" 2>/dev/null || true)"
  previous_epoch="$(awk '{print $2}' "$STATE_FILE" 2>/dev/null || echo 0)"
fi

should_alert=1
if [ -n "$previous_hash" ] && [ "$previous_hash" = "$current_hash" ] && [ $((now_epoch - previous_epoch)) -lt "$cooldown_seconds" ]; then
  should_alert=0
fi

if [ "$should_alert" -eq 1 ]; then
  if "${SCRIPT_DIR}/alert-auth-abuse.sh" "$TMP_REPORT"; then
    echo "${current_hash} ${now_epoch}" > "$STATE_FILE"
    chmod 600 "$STATE_FILE"
  else
    echo "[auth-abuse-check] alert delivery failed" >&2
  fi
else
  echo "[auth-abuse-check] alert suppressed by cooldown (${AUTH_ABUSE_ALERT_COOLDOWN_MINUTES}m)"
fi

exit 1
