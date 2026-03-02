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

HEALTHCHECK_TOKEN="${HEALTHCHECK_TOKEN:-}"
if [ -z "$HEALTHCHECK_TOKEN" ]; then
  HEALTHCHECK_TOKEN="$(read_env_value "$ENV_FILE" "HEALTHCHECK_TOKEN")"
fi

if [ -z "$HEALTHCHECK_TOKEN" ]; then
  echo "[dispatch-notifications] HATA: HEALTHCHECK_TOKEN bulunamadi." >&2
  exit 1
fi

HTTP_CODE="$(
  curl \
    -sS \
    --max-time "$TIMEOUT_SECONDS" \
    --resolve "${DOMAIN}:443:${CONNECT_IP}" \
    -H "x-health-token: ${HEALTHCHECK_TOKEN}" \
    -H "origin: https://${DOMAIN}" \
    -o /tmp/uppoint-notification-dispatch-body.json \
    -w "%{http_code}" \
    -X POST \
    "$DISPATCH_URL"
)"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[dispatch-notifications] FAIL code=${HTTP_CODE} url=${DISPATCH_URL}" >&2
  cat /tmp/uppoint-notification-dispatch-body.json >&2 || true
  exit 1
fi

echo "[dispatch-notifications] OK ${DISPATCH_URL}"
