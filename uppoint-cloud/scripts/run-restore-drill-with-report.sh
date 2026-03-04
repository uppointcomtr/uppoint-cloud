#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
RESTORE_DRILL_SCRIPT="/opt/uppoint-cloud/scripts/restore-drill-db.sh"

normalize_bool() {
  local raw="${1:-}"
  case "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | xargs)" in
    1|true|yes|on) printf 'true' ;;
    0|false|no|off) printf 'false' ;;
    *) printf 'false' ;;
  esac
}

seal_notification_payload() {
  local plain_text="$1"

  if [ -z "${NOTIFICATION_PAYLOAD_SECRET:-}" ]; then
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

EMAIL_ENABLED="${UPPOINT_RESTORE_DRILL_EMAIL_ENABLED:-}"
EMAIL_TO="${UPPOINT_RESTORE_DRILL_EMAIL_TO:-}"
DATABASE_URL="${DATABASE_URL:-}"
NOTIFICATION_PAYLOAD_SECRET="${NOTIFICATION_PAYLOAD_SECRET:-}"

if [ -z "$EMAIL_ENABLED" ]; then
  EMAIL_ENABLED="$(read_env_value "$ENV_FILE" "UPPOINT_RESTORE_DRILL_EMAIL_ENABLED")"
fi
if [ -z "$EMAIL_TO" ]; then
  EMAIL_TO="$(read_env_value "$ENV_FILE" "UPPOINT_RESTORE_DRILL_EMAIL_TO")"
fi
if [ -z "$EMAIL_TO" ]; then
  EMAIL_TO="$(read_env_value "$ENV_FILE" "UPPOINT_ALERT_EMAIL_TO")"
fi
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi
if [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
  NOTIFICATION_PAYLOAD_SECRET="$(read_env_value "$ENV_FILE" "NOTIFICATION_PAYLOAD_SECRET")"
fi

EMAIL_ENABLED="$(normalize_bool "${EMAIL_ENABLED:-true}")"

if [ -n "$DATABASE_URL" ]; then
  configure_postgres_connection "$DATABASE_URL"
fi

RESTORE_ARGS=("$@")
if [ "$#" -eq 0 ]; then
  RESTORE_ARGS=(--execute --confirm)
fi

OUTPUT_FILE="$(mktemp)"
DRILL_EXIT=0
DRILL_RESULT="SUCCESS"

if "$RESTORE_DRILL_SCRIPT" "${RESTORE_ARGS[@]}" >"$OUTPUT_FILE" 2>&1; then
  DRILL_RESULT="SUCCESS"
else
  DRILL_EXIT=$?
  DRILL_RESULT="FAILURE"
fi

cat "$OUTPUT_FILE"

ALERT_EXIT=0
if [ "$EMAIL_ENABLED" = "true" ]; then
  if [ -z "$EMAIL_TO" ]; then
    echo "[restore-drill-report] email enabled but recipient is missing (UPPOINT_RESTORE_DRILL_EMAIL_TO or UPPOINT_ALERT_EMAIL_TO)." >&2
    ALERT_EXIT=1
  elif [ -z "$DATABASE_URL" ]; then
    echo "[restore-drill-report] email enabled but DATABASE_URL is missing." >&2
    ALERT_EXIT=1
  elif [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
    echo "[restore-drill-report] email enabled but NOTIFICATION_PAYLOAD_SECRET is missing." >&2
    ALERT_EXIT=1
  else
    HOST_LABEL="$(hostname -f 2>/dev/null || hostname)"
    TS_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    RESTORE_COMMAND="$RESTORE_DRILL_SCRIPT ${RESTORE_ARGS[*]}"
    SEVERITY="info"
    SUBJECT="[UPPOINT][INFO] PostgreSQL restore drill succeeded on ${HOST_LABEL}"
    if [ "$DRILL_RESULT" != "SUCCESS" ]; then
      SEVERITY="critical"
      SUBJECT="[UPPOINT][CRITICAL] PostgreSQL restore drill failed on ${HOST_LABEL}"
    fi

    BODY=$(
      cat <<EOF
Timestamp (UTC): ${TS_UTC}
Host: ${HOST_LABEL}
Result: ${DRILL_RESULT}
Command: ${RESTORE_COMMAND}

Output:
$(cat "$OUTPUT_FILE")
EOF
    )

    ALERT_ID="ops_restore_drill_report_$(date +%s%N)"
    SEALED_RECIPIENT="$(seal_notification_payload "$EMAIL_TO")"
    SEALED_SUBJECT="$(seal_notification_payload "$SUBJECT")"
    SEALED_BODY="$(seal_notification_payload "$BODY")"
    SQL_FILE="$(mktemp)"
    cat > "$SQL_FILE" <<'SQL'
INSERT INTO "NotificationOutbox" ("id", "channel", "recipient", "subject", "body", "metadata", "status", "nextAttemptAt", "updatedAt")
VALUES (
  :'alert_id',
  'EMAIL'::"NotificationChannel",
  :'recipient',
  :'subject',
  :'body',
  jsonb_build_object('scope','ops-restore-drill-report','severity',:'severity','result',:'result'),
  'PENDING'::"NotificationOutboxStatus",
  NOW(),
  NOW()
);
SQL
    if psql -v ON_ERROR_STOP=1 -q \
      -v alert_id="$ALERT_ID" \
      -v recipient="$SEALED_RECIPIENT" \
      -v subject="$SEALED_SUBJECT" \
      -v body="$SEALED_BODY" \
      -v severity="$SEVERITY" \
      -v result="$DRILL_RESULT" \
      -f "$SQL_FILE"; then
      echo "[restore-drill-report] Email report enqueued for ${EMAIL_TO} (result=${DRILL_RESULT})"
    else
      echo "[restore-drill-report] Email report enqueue failed" >&2
      ALERT_EXIT=1
    fi
    rm -f "$SQL_FILE"
  fi
else
  echo "[restore-drill-report] email reporting disabled."
fi

rm -f "$OUTPUT_FILE"

if [ "$DRILL_EXIT" -ne 0 ]; then
  exit "$DRILL_EXIT"
fi

if [ "$ALERT_EXIT" -ne 0 ]; then
  exit "$ALERT_EXIT"
fi
