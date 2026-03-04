#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
DOMAIN="${UPPOINT_HEALTHCHECK_DOMAIN:-cloud.uppoint.com.tr}"
CONNECT_IP="${UPPOINT_HEALTHCHECK_CONNECT_IP:-127.0.0.1}"
TIMEOUT_SECONDS="${UPPOINT_HEALTHCHECK_TIMEOUT_SECONDS:-10}"
DISPATCH_URL="https://${DOMAIN}/api/internal/notifications/dispatch"
BODY_FILE="$(mktemp /tmp/uppoint-notification-dispatch-body.XXXXXX.json)"
HEADER_FILE="$(mktemp /tmp/uppoint-notification-dispatch-header.XXXXXX)"

cleanup() {
  rm -f "$BODY_FILE" "$HEADER_FILE"
}

trap cleanup EXIT

INTERNAL_DISPATCH_TOKEN="${INTERNAL_DISPATCH_TOKEN:-}"
INTERNAL_DISPATCH_SIGNING_SECRET="${INTERNAL_DISPATCH_SIGNING_SECRET:-}"
INTERNAL_AUTH_TRANSPORT_MODE="${INTERNAL_AUTH_TRANSPORT_MODE:-}"
UPPOINT_CLOSED_SYSTEM_MODE="${UPPOINT_CLOSED_SYSTEM_MODE:-}"
UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE="${UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE:-}"
NODE_ENV="${NODE_ENV:-}"

normalize_bool() {
  local raw="${1:-}"
  case "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) printf 'true' ;;
    0|false|no|off) printf 'false' ;;
    *) printf '' ;;
  esac
}

if [ -z "$INTERNAL_DISPATCH_TOKEN" ]; then
  INTERNAL_DISPATCH_TOKEN="$(read_env_value "$ENV_FILE" "INTERNAL_DISPATCH_TOKEN")"
fi
if [ -z "$INTERNAL_DISPATCH_SIGNING_SECRET" ]; then
  INTERNAL_DISPATCH_SIGNING_SECRET="$(read_env_value "$ENV_FILE" "INTERNAL_DISPATCH_SIGNING_SECRET")"
fi
if [ -z "$INTERNAL_AUTH_TRANSPORT_MODE" ]; then
  INTERNAL_AUTH_TRANSPORT_MODE="$(read_env_value "$ENV_FILE" "INTERNAL_AUTH_TRANSPORT_MODE")"
fi
if [ -z "$UPPOINT_CLOSED_SYSTEM_MODE" ]; then
  UPPOINT_CLOSED_SYSTEM_MODE="$(read_env_value "$ENV_FILE" "UPPOINT_CLOSED_SYSTEM_MODE")"
fi
if [ -z "$UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE" ]; then
  UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE="$(read_env_value "$ENV_FILE" "UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE")"
fi
if [ -z "$NODE_ENV" ]; then
  NODE_ENV="$(read_env_value "$ENV_FILE" "NODE_ENV")"
fi
if [ -z "$INTERNAL_AUTH_TRANSPORT_MODE" ]; then
  INTERNAL_AUTH_TRANSPORT_MODE="loopback-hmac-v1"
fi
UPPOINT_CLOSED_SYSTEM_MODE="$(normalize_bool "${UPPOINT_CLOSED_SYSTEM_MODE:-true}")"
UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE="$(normalize_bool "${UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE:-false}")"

if [ "${INTERNAL_AUTH_TRANSPORT_MODE}" = "loopback-hmac-v1" ] && [ "${NODE_ENV}" = "production" ]; then
  if [ "${DOMAIN}" != "cloud.uppoint.com.tr" ] || { [ "${CONNECT_IP}" != "127.0.0.1" ] && [ "${CONNECT_IP}" != "::1" ]; }; then
    if [ "${UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE}" != "true" ] || [ "${UPPOINT_CLOSED_SYSTEM_MODE:-true}" = "true" ]; then
      echo "[dispatch-notifications] FAIL: production loopback transport requires DOMAIN=cloud.uppoint.com.tr and CONNECT_IP=127.0.0.1/::1." >&2
      echo "[dispatch-notifications] Set UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE=true and UPPOINT_CLOSED_SYSTEM_MODE=false only for explicit owner-approved exceptions." >&2
      exit 1
    fi
  fi
fi

if [ -z "$INTERNAL_DISPATCH_TOKEN" ]; then
  echo "[dispatch-notifications] HATA: INTERNAL_DISPATCH_TOKEN bulunamadi." >&2
  exit 1
fi
if [ -z "$INTERNAL_DISPATCH_SIGNING_SECRET" ]; then
  echo "[dispatch-notifications] HATA: INTERNAL_DISPATCH_SIGNING_SECRET bulunamadi." >&2
  exit 1
fi

REQUEST_TS="$(date -u +%s)"
REQUEST_ID="dispatch-$(date -u +%s)-$(openssl rand -hex 8)"
BODY_SHA256="$(printf '' | sha256sum | awk '{print $1}')"
CANONICAL_REQUEST="POST
/api/internal/notifications/dispatch
${REQUEST_ID}
${REQUEST_TS}
${BODY_SHA256}"
REQUEST_SIGNATURE="$(
  printf '%s' "$CANONICAL_REQUEST" | INTERNAL_DISPATCH_SIGNING_SECRET="$INTERNAL_DISPATCH_SIGNING_SECRET" node -e '
const { createHmac } = require("crypto");
const fs = require("fs");

const secret = process.env.INTERNAL_DISPATCH_SIGNING_SECRET || "";
if (!secret) {
  process.exit(1);
}

const canonical = fs.readFileSync(0, "utf8");
process.stdout.write(createHmac("sha256", secret).update(canonical).digest("hex"));
'
)"

{
  printf 'x-request-id: %s\n' "$REQUEST_ID"
  printf 'x-internal-request-id: %s\n' "$REQUEST_ID"
  printf 'x-internal-dispatch-token: %s\n' "$INTERNAL_DISPATCH_TOKEN"
  printf 'x-internal-request-ts: %s\n' "$REQUEST_TS"
  printf 'x-internal-request-signature: %s\n' "$REQUEST_SIGNATURE"
  printf 'x-internal-transport: %s\n' "$INTERNAL_AUTH_TRANSPORT_MODE"
  printf 'origin: https://%s\n' "$DOMAIN"
} > "$HEADER_FILE"

HTTP_CODE="$(
  curl \
    -sS \
    --max-time "$TIMEOUT_SECONDS" \
    --resolve "${DOMAIN}:443:${CONNECT_IP}" \
    -H "@${HEADER_FILE}" \
    -o "$BODY_FILE" \
    -w "%{http_code}" \
    -X POST \
    "$DISPATCH_URL"
)"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[dispatch-notifications] FAIL code=${HTTP_CODE} url=${DISPATCH_URL}" >&2
  cat "$BODY_FILE" >&2 || true
  exit 1
fi

echo "[dispatch-notifications] OK ${DISPATCH_URL}"
