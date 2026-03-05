#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"

normalize_bool() {
  local raw="${1:-}"
  case "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | xargs)" in
    1|true|yes|on) printf 'true' ;;
    0|false|no|off) printf 'false' ;;
    *) printf 'false' ;;
  esac
}

normalize_canary_mode() {
  local raw="${1:-}"
  case "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | xargs)" in
    ""|probe-only|probe_only|probe) printf 'probe-only' ;;
    enqueue-email|enqueue_email|email) printf 'enqueue-email' ;;
    *) printf 'invalid' ;;
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

DATABASE_URL="${DATABASE_URL:-}"
NOTIFICATION_PAYLOAD_SECRET="${NOTIFICATION_PAYLOAD_SECRET:-}"
CANARY_ENABLED="${UPPOINT_NOTIFICATION_CANARY_ENABLED:-}"
CANARY_MODE="${UPPOINT_NOTIFICATION_CANARY_MODE:-}"
CANARY_EMAIL_TO="${UPPOINT_NOTIFICATION_CANARY_EMAIL_TO:-}"

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi
if [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
  NOTIFICATION_PAYLOAD_SECRET="$(read_env_value "$ENV_FILE" "NOTIFICATION_PAYLOAD_SECRET")"
fi
if [ -z "$CANARY_ENABLED" ]; then
  CANARY_ENABLED="$(read_env_value "$ENV_FILE" "UPPOINT_NOTIFICATION_CANARY_ENABLED")"
fi
if [ -z "$CANARY_MODE" ]; then
  CANARY_MODE="$(read_env_value "$ENV_FILE" "UPPOINT_NOTIFICATION_CANARY_MODE")"
fi
if [ -z "$CANARY_EMAIL_TO" ]; then
  CANARY_EMAIL_TO="$(read_env_value "$ENV_FILE" "UPPOINT_NOTIFICATION_CANARY_EMAIL_TO")"
fi
if [ -z "$CANARY_EMAIL_TO" ]; then
  CANARY_EMAIL_TO="$(read_env_value "$ENV_FILE" "UPPOINT_ALERT_EMAIL_TO")"
fi

CANARY_ENABLED="$(normalize_bool "${CANARY_ENABLED:-true}")"
CANARY_MODE="$(normalize_canary_mode "${CANARY_MODE:-probe-only}")"

if [ "$CANARY_ENABLED" != "true" ]; then
  echo "[notification-canary] skipped: UPPOINT_NOTIFICATION_CANARY_ENABLED=false"
  exit 0
fi

if [ "$CANARY_MODE" = "invalid" ]; then
  echo "[notification-canary] invalid mode: UPPOINT_NOTIFICATION_CANARY_MODE must be 'probe-only' or 'enqueue-email'." >&2
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[notification-canary] DATABASE_URL is required." >&2
  exit 1
fi

configure_postgres_connection "$DATABASE_URL"

HOST_LABEL="$(hostname -f 2>/dev/null || hostname)"
TS_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [ "$CANARY_MODE" = "probe-only" ]; then
  STATS_RAW="$(
    psql -v ON_ERROR_STOP=1 -qAt -c "
      SELECT
        COALESCE((SELECT COUNT(*) FROM \"NotificationOutbox\" WHERE \"status\"='PENDING'::\"NotificationOutboxStatus\" AND \"nextAttemptAt\" <= NOW()), 0),
        COALESCE((SELECT COUNT(*) FROM \"NotificationOutbox\" WHERE \"status\"='SENT'::\"NotificationOutboxStatus\" AND \"updatedAt\" >= NOW() - INTERVAL '30 minutes'), 0),
        COALESCE((SELECT COUNT(*) FROM \"NotificationOutbox\" WHERE \"status\"='FAILED'::\"NotificationOutboxStatus\" AND \"updatedAt\" >= NOW() - INTERVAL '30 minutes'), 0)
    "
  )"

  IFS='|' read -r PENDING_DUE SENT_30M FAILED_30M <<< "$STATS_RAW"
  PENDING_DUE="${PENDING_DUE:-0}"
  SENT_30M="${SENT_30M:-0}"
  FAILED_30M="${FAILED_30M:-0}"

  echo "[notification-canary] scope=ops-notification-canary mode=probe-only ts=${TS_UTC} host=${HOST_LABEL} pending_due=${PENDING_DUE} sent_30m=${SENT_30M} failed_30m=${FAILED_30M}"
  exit 0
fi

if [ -z "$NOTIFICATION_PAYLOAD_SECRET" ]; then
  echo "[notification-canary] NOTIFICATION_PAYLOAD_SECRET is required for enqueue-email mode." >&2
  exit 1
fi
if [ -z "$CANARY_EMAIL_TO" ]; then
  echo "[notification-canary] recipient is required (UPPOINT_NOTIFICATION_CANARY_EMAIL_TO or UPPOINT_ALERT_EMAIL_TO) in enqueue-email mode." >&2
  exit 1
fi

CANARY_ID="ops_notification_canary_$(date +%s%N)"
SUBJECT="[UPPOINT][CANARY] Notification delivery health check (${HOST_LABEL})"
BODY=$(
  cat <<EOF
Timestamp (UTC): ${TS_UTC}
Host: ${HOST_LABEL}
Type: notification delivery canary
Scope: ops-notification-canary

This is a low-risk operational heartbeat email used for delivery-path visibility.
EOF
)

SEALED_RECIPIENT="$(seal_notification_payload "$CANARY_EMAIL_TO")"
SEALED_SUBJECT="$(seal_notification_payload "$SUBJECT")"
SEALED_BODY="$(seal_notification_payload "$BODY")"

SQL_FILE="$(mktemp)"
cat > "$SQL_FILE" <<'SQL'
INSERT INTO "NotificationOutbox" ("id", "channel", "recipient", "subject", "body", "metadata", "status", "nextAttemptAt", "updatedAt")
VALUES (
  :'canary_id',
  'EMAIL'::"NotificationChannel",
  :'recipient',
  :'subject',
  :'body',
  jsonb_build_object('scope','ops-notification-canary','severity','info','host',:'host'),
  'PENDING'::"NotificationOutboxStatus",
  NOW(),
  NOW()
);
SQL

if psql -v ON_ERROR_STOP=1 -q \
  -v canary_id="$CANARY_ID" \
  -v recipient="$SEALED_RECIPIENT" \
  -v subject="$SEALED_SUBJECT" \
  -v body="$SEALED_BODY" \
  -v host="$HOST_LABEL" \
  -f "$SQL_FILE"; then
  echo "[notification-canary] enqueued id=${CANARY_ID} to=${CANARY_EMAIL_TO}"
else
  echo "[notification-canary] enqueue failed" >&2
  rm -f "$SQL_FILE"
  exit 1
fi

rm -f "$SQL_FILE"
