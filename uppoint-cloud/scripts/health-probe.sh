#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${UPPOINT_HEALTHCHECK_DOMAIN:-cloud.uppoint.com.tr}"
CONNECT_IP="${UPPOINT_HEALTHCHECK_CONNECT_IP:-127.0.0.1}"
PROBE_URL="https://${DOMAIN}/api/health"
TIMEOUT_SECONDS="${UPPOINT_HEALTHCHECK_TIMEOUT_SECONDS:-10}"
ENV_FILE="/opt/uppoint-cloud/.env"

HEALTHCHECK_TOKEN="${HEALTHCHECK_TOKEN:-}"

load_env_file() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

load_env_file
HEALTHCHECK_TOKEN="${HEALTHCHECK_TOKEN:-}"

curl_args=(
  -sS
  --max-time "$TIMEOUT_SECONDS"
  --resolve "${DOMAIN}:443:${CONNECT_IP}"
  -o /tmp/uppoint-health-probe-body.json
  -w "%{http_code}"
)

if [ -n "$HEALTHCHECK_TOKEN" ]; then
  curl_args+=(-H "x-health-token: ${HEALTHCHECK_TOKEN}")
fi

HTTP_CODE="$(
  curl "${curl_args[@]}" "$PROBE_URL"
)"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[health-probe] FAIL code=${HTTP_CODE} url=${PROBE_URL}" >&2
  cat /tmp/uppoint-health-probe-body.json >&2 || true
  exit 1
fi

if ! grep -q '"status":"ok"' /tmp/uppoint-health-probe-body.json; then
  echo "[health-probe] FAIL unexpected response body from ${PROBE_URL}" >&2
  cat /tmp/uppoint-health-probe-body.json >&2 || true
  exit 1
fi

echo "[health-probe] OK ${PROBE_URL}"
