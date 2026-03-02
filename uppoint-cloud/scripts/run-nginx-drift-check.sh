#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
LOG_FILE="/var/log/uppoint-nginx-drift-check.log"
STATE_DIR="/var/lib/uppoint-cloud"
STATE_FILE="${STATE_DIR}/nginx-drift-alert.state"
DEFAULT_COOLDOWN_MINUTES=60
FAIL_PATTERN='\[drift\].*(mismatch|missing|invalid|detected|insecure)'

RATE_LIMIT_DRIFT_POLICY="${RATE_LIMIT_DRIFT_POLICY:-enforce-baseline}"
UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES="${UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES:-}"

if [ -z "$UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES" ]; then
  UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES="$(read_env_value "$ENV_FILE" "UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES")"
fi
UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES="${UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES:-$DEFAULT_COOLDOWN_MINUTES}"

if ! [[ "$UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES" =~ ^[0-9]+$ ]] || [ "$UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES" -lt 1 ]; then
  echo "[nginx-drift-check] invalid cooldown: ${UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES}" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
touch "$LOG_FILE"

TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

run_started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if RATE_LIMIT_DRIFT_POLICY="$RATE_LIMIT_DRIFT_POLICY" "${SCRIPT_DIR}/check-nginx-config-drift.sh" >"$TMP_OUTPUT" 2>&1; then
  {
    echo "[${run_started_at}] [nginx-drift-check] start policy=${RATE_LIMIT_DRIFT_POLICY}"
    cat "$TMP_OUTPUT"
    echo "[${run_started_at}] [nginx-drift-check] result=ok"
  } >> "$LOG_FILE"
  exit 0
fi

{
  echo "[${run_started_at}] [nginx-drift-check] start policy=${RATE_LIMIT_DRIFT_POLICY}"
  cat "$TMP_OUTPUT"
  echo "[${run_started_at}] [nginx-drift-check] result=fail"
} >> "$LOG_FILE"

if ! tail -n 120 "$LOG_FILE" | grep -Eq "$FAIL_PATTERN"; then
  echo "[nginx-drift-check] failure without matching alert pattern; skipping alert." >> "$LOG_FILE"
  exit 1
fi

current_hash="$(sha256sum "$TMP_OUTPUT" | awk '{print $1}')"
now_epoch="$(date +%s)"
cooldown_seconds=$((UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES * 60))

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
  if "${SCRIPT_DIR}/alert-nginx-drift.sh" "$TMP_OUTPUT" >> "$LOG_FILE" 2>&1; then
    echo "${current_hash} ${now_epoch}" > "$STATE_FILE"
    chmod 600 "$STATE_FILE"
  else
    echo "[nginx-drift-check] alert delivery failed" >> "$LOG_FILE"
  fi
else
  echo "[nginx-drift-check] alert suppressed by cooldown (${UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES}m)" >> "$LOG_FILE"
fi

exit 1

