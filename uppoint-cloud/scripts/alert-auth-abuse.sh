#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"

if [ "$#" -lt 1 ]; then
  echo "Usage: $(basename "$0") <report_path>" >&2
  exit 1
fi

REPORT_PATH="$1"
if [ ! -f "$REPORT_PATH" ]; then
  echo "[auth-abuse-alert] report not found: ${REPORT_PATH}" >&2
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
  echo "[auth-abuse-alert] NOTIFICATION_PAYLOAD_SECRET is required for encrypted outbox email alerts" >&2
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
SUBJECT="[UPPOINT][HIGH] Auth abuse threshold exceeded on ${HOST_LABEL}"
REPORT_CONTENT="$(cat "$REPORT_PATH")"
BODY=$(
  cat <<EOF
Timestamp (UTC): ${TS_UTC}
Host: ${HOST_LABEL}
Scope: auth abuse threshold monitor

Report:
${REPORT_CONTENT}
EOF
)

CHANNEL_DELIVERED=0

if [ -n "$UPPOINT_ALERT_SLACK_WEBHOOK" ]; then
  SLACK_TEXT=$(
    cat <<EOF
:rotating_light: Auth abuse threshold exceeded
Host: ${HOST_LABEL}
Time (UTC): ${TS_UTC}

${REPORT_CONTENT}
EOF
  )
  SLACK_PAYLOAD="$(node -e "process.stdout.write(JSON.stringify({text: process.argv[1]}));" "$SLACK_TEXT")"
  if curl -sS -X POST -H "Content-Type: application/json" --data "$SLACK_PAYLOAD" "$UPPOINT_ALERT_SLACK_WEBHOOK" >/dev/null; then
    CHANNEL_DELIVERED=1
    echo "[auth-abuse-alert] Slack alert sent"
  else
    echo "[auth-abuse-alert] Slack alert failed" >&2
  fi
fi

if [ -n "$UPPOINT_ALERT_EMAIL_TO" ] && [ -n "$DATABASE_URL" ]; then
  ALERT_ID="ops_auth_abuse_alert_$(date +%s%N)"
  SEALED_RECIPIENT="$(seal_notification_payload "$UPPOINT_ALERT_EMAIL_TO")"
  SEALED_SUBJECT="$(seal_notification_payload "$SUBJECT")"
  SEALED_BODY="$(seal_notification_payload "$BODY")"
  SQL_FILE="$(mktemp)"
  cat > "$SQL_FILE" <<'SQL'
INSERT INTO "NotificationOutbox" ("id", "channel", "recipient", "subject", "body", "metadata", "status", "nextAttemptAt", "updatedAt")
VALUES (:'alert_id', 'EMAIL'::"NotificationChannel", :'recipient', :'subject', :'body', jsonb_build_object('scope','ops-auth-abuse-alert','severity','high'), 'PENDING'::"NotificationOutboxStatus", NOW(), NOW());
SQL
  if psql -v ON_ERROR_STOP=1 -q \
    -v alert_id="$ALERT_ID" \
    -v recipient="$SEALED_RECIPIENT" \
    -v subject="$SEALED_SUBJECT" \
    -v body="$SEALED_BODY" \
    -f "$SQL_FILE"; then
    CHANNEL_DELIVERED=1
    echo "[auth-abuse-alert] Email alert enqueued for ${UPPOINT_ALERT_EMAIL_TO}"
  else
    echo "[auth-abuse-alert] Email alert enqueue failed" >&2
  fi
  rm -f "$SQL_FILE"
fi

if [ "$CHANNEL_DELIVERED" -eq 0 ]; then
  echo "[auth-abuse-alert] no alert channel delivered (configure UPPOINT_ALERT_SLACK_WEBHOOK and/or UPPOINT_ALERT_EMAIL_TO)" >&2
  exit 1
fi
