#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"

if [ "$#" -lt 1 ]; then
  echo "Usage: $(basename "$0") <failure_log_path>" >&2
  exit 1
fi

FAILURE_LOG_PATH="$1"
if [ ! -f "$FAILURE_LOG_PATH" ]; then
  echo "[nginx-drift-alert] failure log not found: ${FAILURE_LOG_PATH}" >&2
  exit 1
fi

UPPOINT_ALERT_SLACK_WEBHOOK="${UPPOINT_ALERT_SLACK_WEBHOOK:-}"
UPPOINT_ALERT_EMAIL_TO="${UPPOINT_ALERT_EMAIL_TO:-}"
DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$UPPOINT_ALERT_SLACK_WEBHOOK" ]; then
  UPPOINT_ALERT_SLACK_WEBHOOK="$(read_env_value "$ENV_FILE" "UPPOINT_ALERT_SLACK_WEBHOOK")"
fi

if [ -z "$UPPOINT_ALERT_EMAIL_TO" ]; then
  UPPOINT_ALERT_EMAIL_TO="$(read_env_value "$ENV_FILE" "UPPOINT_ALERT_EMAIL_TO")"
fi

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi

HOST_LABEL="$(hostname -f 2>/dev/null || hostname)"
TS_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SUBJECT="[UPPOINT][CRITICAL] Nginx drift check failed on ${HOST_LABEL}"
FAILURE_TAIL="$(tail -n 60 "$FAILURE_LOG_PATH")"
BODY=$(
  cat <<EOF
Timestamp (UTC): ${TS_UTC}
Host: ${HOST_LABEL}
Policy: enforce-baseline

Detected failure pattern in /var/log/uppoint-nginx-drift-check.log.
Recent output:
${FAILURE_TAIL}
EOF
)

CHANNEL_DELIVERED=0

if [ -n "$UPPOINT_ALERT_SLACK_WEBHOOK" ]; then
  SLACK_TEXT=$(
    cat <<EOF
:rotating_light: Nginx drift check failed
Host: ${HOST_LABEL}
Time (UTC): ${TS_UTC}

$(tail -n 20 "$FAILURE_LOG_PATH")
EOF
  )

  SLACK_PAYLOAD="$(node -e "process.stdout.write(JSON.stringify({text: process.argv[1]}));" "$SLACK_TEXT")"

  if curl -sS -X POST -H "Content-Type: application/json" --data "$SLACK_PAYLOAD" "$UPPOINT_ALERT_SLACK_WEBHOOK" >/dev/null; then
    CHANNEL_DELIVERED=1
    echo "[nginx-drift-alert] Slack alert sent"
  else
    echo "[nginx-drift-alert] Slack alert failed" >&2
  fi
fi

if [ -n "$UPPOINT_ALERT_EMAIL_TO" ] && [ -n "$DATABASE_URL" ]; then
  ALERT_ID="ops_drift_alert_$(date +%s%N)"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    --set=alert_id="$ALERT_ID" \
    --set=recipient="$UPPOINT_ALERT_EMAIL_TO" \
    --set=subject="$SUBJECT" \
    --set=body="$BODY" \
    -c "INSERT INTO \"NotificationOutbox\" (\"id\", \"channel\", \"recipient\", \"subject\", \"body\", \"metadata\", \"status\", \"nextAttemptAt\", \"updatedAt\") VALUES (:'alert_id', 'EMAIL'::\"NotificationChannel\", :'recipient', :'subject', :'body', jsonb_build_object('scope','ops-nginx-drift-alert','severity','critical'), 'PENDING'::\"NotificationOutboxStatus\", NOW(), NOW());"; then
    CHANNEL_DELIVERED=1
    echo "[nginx-drift-alert] Email alert enqueued for ${UPPOINT_ALERT_EMAIL_TO}"
  else
    echo "[nginx-drift-alert] Email alert enqueue failed" >&2
  fi
fi

if [ "$CHANNEL_DELIVERED" -eq 0 ]; then
  echo "[nginx-drift-alert] no alert channel delivered (configure UPPOINT_ALERT_SLACK_WEBHOOK and/or UPPOINT_ALERT_EMAIL_TO)" >&2
  exit 1
fi

