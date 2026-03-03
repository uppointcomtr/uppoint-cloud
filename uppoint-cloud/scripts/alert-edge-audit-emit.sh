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
  echo "[edge-audit-alert] failure log not found: ${FAILURE_LOG_PATH}" >&2
  exit 1
fi

UPPOINT_ALERT_SLACK_WEBHOOK="${UPPOINT_ALERT_SLACK_WEBHOOK:-}"
UPPOINT_ALERT_EMAIL_TO="${UPPOINT_ALERT_EMAIL_TO:-}"
DATABASE_URL="${DATABASE_URL:-}"
NOTIFICATION_PAYLOAD_SECRET="${NOTIFICATION_PAYLOAD_SECRET:-}"

if [ -z "$UPPOINT_ALERT_SLACK_WEBHOOK" ]; then
  UPPOINT_ALERT_SLACK_WEBHOOK="$(read_env_value "$ENV_FILE" "UPPOINT_ALERT_SLACK_WEBHOOK")"
fi

if [ -z "$UPPOINT_ALERT_EMAIL_TO" ]; then
  UPPOINT_ALERT_EMAIL_TO="$(read_env_value "$ENV_FILE" "UPPOINT_ALERT_EMAIL_TO")"
fi

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi
if [ -n "$DATABASE_URL" ]; then
  configure_postgres_connection "$DATABASE_URL"
fi

if [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
  NOTIFICATION_PAYLOAD_SECRET="$(read_env_value "$ENV_FILE" "NOTIFICATION_PAYLOAD_SECRET")"
fi

if [ -n "$UPPOINT_ALERT_EMAIL_TO" ] && [ -n "$DATABASE_URL" ] && [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
  echo "[edge-audit-alert] NOTIFICATION_PAYLOAD_SECRET is required for encrypted outbox email alerts" >&2
  exit 1
fi

seal_notification_payload() {
  local plain_text="$1"

  if [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
    printf '%s' "$plain_text"
    return 0
  fi

  printf '%s' "$plain_text" | NOTIFICATION_PAYLOAD_SECRET="$NOTIFICATION_PAYLOAD_SECRET" node --input-type=module -e '
import fs from "fs";
import { sealNotificationPayloadWithSecret } from "/opt/uppoint-cloud/modules/notifications/server/payload-crypto-core.mjs";

const secret = process.env.NOTIFICATION_PAYLOAD_SECRET || "";
const plainText = fs.readFileSync(0, "utf8");

if (!secret) {
  process.stdout.write(plainText);
  process.exit(0);
}

process.stdout.write(sealNotificationPayloadWithSecret(plainText, secret));
'
}

HOST_LABEL="$(hostname -f 2>/dev/null || hostname)"
TS_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SUBJECT="[UPPOINT][CRITICAL] Edge audit emit failures detected on ${HOST_LABEL}"
FAILURE_TAIL="$(tail -n 80 "$FAILURE_LOG_PATH")"
BODY=$(
  cat <<EOF
Timestamp (UTC): ${TS_UTC}
Host: ${HOST_LABEL}

Detected [edge-audit-emit] failed pattern in service logs.
Recent matched output:
${FAILURE_TAIL}
EOF
)

CHANNEL_DELIVERED=0

if [ -n "$UPPOINT_ALERT_SLACK_WEBHOOK" ]; then
  SLACK_TEXT=$(
    cat <<EOF
:rotating_light: Edge audit emit failures detected
Host: ${HOST_LABEL}
Time (UTC): ${TS_UTC}

$(tail -n 30 "$FAILURE_LOG_PATH")
EOF
  )

  SLACK_PAYLOAD="$(node -e "process.stdout.write(JSON.stringify({text: process.argv[1]}));" "$SLACK_TEXT")"

  if curl -sS -X POST -H "Content-Type: application/json" --data "$SLACK_PAYLOAD" "$UPPOINT_ALERT_SLACK_WEBHOOK" >/dev/null; then
    CHANNEL_DELIVERED=1
    echo "[edge-audit-alert] Slack alert sent"
  else
    echo "[edge-audit-alert] Slack alert failed" >&2
  fi
fi

if [ -n "$UPPOINT_ALERT_EMAIL_TO" ] && [ -n "$DATABASE_URL" ]; then
  ALERT_ID="ops_edge_audit_alert_$(date +%s%N)"
  SEALED_RECIPIENT="$(seal_notification_payload "$UPPOINT_ALERT_EMAIL_TO")"
  SEALED_SUBJECT="$(seal_notification_payload "$SUBJECT")"
  SEALED_BODY="$(seal_notification_payload "$BODY")"
  if psql -v ON_ERROR_STOP=1 -q \
    --set=alert_id="$ALERT_ID" \
    --set=recipient="$SEALED_RECIPIENT" \
    --set=subject="$SEALED_SUBJECT" \
    --set=body="$SEALED_BODY" \
    -c "INSERT INTO \"NotificationOutbox\" (\"id\", \"channel\", \"recipient\", \"subject\", \"body\", \"metadata\", \"status\", \"nextAttemptAt\", \"updatedAt\") VALUES (:'alert_id', 'EMAIL'::\"NotificationChannel\", :'recipient', :'subject', :'body', jsonb_build_object('scope','ops-edge-audit-emit-alert','severity','critical'), 'PENDING'::\"NotificationOutboxStatus\", NOW(), NOW());"; then
    CHANNEL_DELIVERED=1
    echo "[edge-audit-alert] Email alert enqueued for ${UPPOINT_ALERT_EMAIL_TO}"
  else
    echo "[edge-audit-alert] Email alert enqueue failed" >&2
  fi
fi

if [ "$CHANNEL_DELIVERED" -eq 0 ]; then
  echo "[edge-audit-alert] no alert channel delivered (configure UPPOINT_ALERT_SLACK_WEBHOOK and/or UPPOINT_ALERT_EMAIL_TO)" >&2
  exit 1
fi
