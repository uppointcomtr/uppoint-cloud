#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
LOG_DIR="/var/log/uppoint-cloud"
LOG_FILE="${LOG_DIR}/edge-audit-emit-check.log"
STATE_DIR="/var/lib/uppoint-cloud"
STATE_FILE="${STATE_DIR}/edge-audit-emit-alert.state"
DEFAULT_LOOKBACK_MINUTES=15
DEFAULT_COOLDOWN_MINUTES=60
FAIL_PATTERN='\[edge-audit-emit\] failed'

UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES="${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES:-}"
UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES="${UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES:-}"

if [ -z "$UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES" ]; then
  UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES="$(read_env_value "$ENV_FILE" "UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES")"
fi
UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES="${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES:-$DEFAULT_LOOKBACK_MINUTES}"

if [ -z "$UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES" ]; then
  UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES="$(read_env_value "$ENV_FILE" "UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES")"
fi
UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES="${UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES:-$DEFAULT_COOLDOWN_MINUTES}"

if ! [[ "$UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES" =~ ^[0-9]+$ ]] || [ "$UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES" -lt 1 ]; then
  echo "[edge-audit-check] invalid lookback: ${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES}" >&2
  exit 1
fi

if ! [[ "$UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES" =~ ^[0-9]+$ ]] || [ "$UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES" -lt 1 ]; then
  echo "[edge-audit-check] invalid cooldown: ${UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES}" >&2
  exit 1
fi

if ! command -v journalctl >/dev/null 2>&1; then
  echo "[edge-audit-check] journalctl not found" >&2
  exit 1
fi

mkdir -p "$STATE_DIR" "$LOG_DIR"
chmod 700 "$STATE_DIR"
touch "$LOG_FILE"

TMP_JOURNAL="$(mktemp)"
TMP_FAILURE="$(mktemp)"
TMP_REPORT="$(mktemp)"
trap 'rm -f "$TMP_JOURNAL" "$TMP_FAILURE" "$TMP_REPORT"' EXIT

run_started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
lookback_expr="${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES} minutes ago"

if ! journalctl -u uppoint-cloud.service --since "$lookback_expr" --no-pager -o cat >"$TMP_JOURNAL" 2>&1; then
  {
    echo "[${run_started_at}] [edge-audit-check] result=error"
    cat "$TMP_JOURNAL"
  } >> "$LOG_FILE"
  exit 1
fi

if ! grep -E "$FAIL_PATTERN" "$TMP_JOURNAL" > "$TMP_FAILURE"; then
  echo "[${run_started_at}] [edge-audit-check] result=ok lookback=${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES}m matches=0" >> "$LOG_FILE"
  exit 0
fi

match_count="$(wc -l < "$TMP_FAILURE" | tr -d ' ')"
{
  echo "Timestamp (UTC): ${run_started_at}"
  echo "Lookback: ${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES}m"
  echo "Pattern: ${FAIL_PATTERN}"
  echo "Match count: ${match_count}"
  echo
  cat "$TMP_FAILURE"
} > "$TMP_REPORT"

{
  echo "[${run_started_at}] [edge-audit-check] result=fail lookback=${UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES}m matches=${match_count}"
  cat "$TMP_REPORT"
} >> "$LOG_FILE"

current_hash="$(sha256sum "$TMP_REPORT" | awk '{print $1}')"
now_epoch="$(date +%s)"
cooldown_seconds=$((UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES * 60))

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
  if "${SCRIPT_DIR}/alert-edge-audit-emit.sh" "$TMP_REPORT" >> "$LOG_FILE" 2>&1; then
    echo "${current_hash} ${now_epoch}" > "$STATE_FILE"
    chmod 600 "$STATE_FILE"
  else
    echo "[edge-audit-check] alert delivery failed" >> "$LOG_FILE"
  fi
else
  echo "[edge-audit-check] alert suppressed by cooldown (${UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES}m)" >> "$LOG_FILE"
fi

exit 1
