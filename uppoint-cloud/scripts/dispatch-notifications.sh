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
if [ -z "$INTERNAL_DISPATCH_TOKEN" ]; then
  INTERNAL_DISPATCH_TOKEN="$(read_env_value "$ENV_FILE" "INTERNAL_DISPATCH_TOKEN")"
fi

if [ -z "$INTERNAL_DISPATCH_TOKEN" ]; then
  echo "[dispatch-notifications] HATA: INTERNAL_DISPATCH_TOKEN bulunamadi." >&2
  exit 1
fi

{
  printf 'x-internal-dispatch-token: %s\n' "$INTERNAL_DISPATCH_TOKEN"
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
