#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/uppoint-cloud/.env"
SNIPPET_DIR="/etc/nginx/snippets"
SNIPPET_FILE="${SNIPPET_DIR}/uppoint-health-token.conf"

if [ ! -f "$ENV_FILE" ]; then
  echo "[health-token-sync] Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

TOKEN_LINE="$(grep -m1 '^HEALTHCHECK_TOKEN=' "$ENV_FILE" || true)"
TOKEN_VALUE="${TOKEN_LINE#HEALTHCHECK_TOKEN=}"

if [ -z "$TOKEN_VALUE" ] || [ "$TOKEN_LINE" = "$TOKEN_VALUE" ]; then
  echo "[health-token-sync] HEALTHCHECK_TOKEN is empty or missing in ${ENV_FILE}" >&2
  exit 1
fi

install -d -m 755 "$SNIPPET_DIR"

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

cat > "$TMP_FILE" <<EOF
# Managed by /opt/uppoint-cloud/scripts/sync-healthcheck-token-to-nginx.sh
proxy_set_header x-health-token "${TOKEN_VALUE}";
EOF

install -m 640 -o root -g www-data "$TMP_FILE" "$SNIPPET_FILE"

nginx -t
systemctl reload nginx

echo "[health-token-sync] Updated ${SNIPPET_FILE} and reloaded nginx"
