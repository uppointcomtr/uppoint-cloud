#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"

DATABASE_URL="${DATABASE_URL:-}"
AUDIT_LOG_SIGNING_SECRET="${AUDIT_LOG_SIGNING_SECRET:-}"
AUDIT_ANCHOR_SIGNING_SECRET="${AUDIT_ANCHOR_SIGNING_SECRET:-}"
AUDIT_ANCHOR_SIGNING_KEY_ID="${AUDIT_ANCHOR_SIGNING_KEY_ID:-}"
AUDIT_ANCHOR_OUTPUT_PATH="${AUDIT_ANCHOR_OUTPUT_PATH:-}"

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi
if [ -z "$AUDIT_LOG_SIGNING_SECRET" ]; then
  AUDIT_LOG_SIGNING_SECRET="$(read_env_value "$ENV_FILE" "AUDIT_LOG_SIGNING_SECRET")"
fi
if [ -z "$AUDIT_ANCHOR_SIGNING_SECRET" ]; then
  AUDIT_ANCHOR_SIGNING_SECRET="$(read_env_value "$ENV_FILE" "AUDIT_ANCHOR_SIGNING_SECRET")"
fi
if [ -z "$AUDIT_ANCHOR_SIGNING_KEY_ID" ]; then
  AUDIT_ANCHOR_SIGNING_KEY_ID="$(read_env_value "$ENV_FILE" "AUDIT_ANCHOR_SIGNING_KEY_ID")"
fi
if [ -z "$AUDIT_ANCHOR_OUTPUT_PATH" ]; then
  AUDIT_ANCHOR_OUTPUT_PATH="$(read_env_value "$ENV_FILE" "AUDIT_ANCHOR_OUTPUT_PATH")"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[audit-anchor] DATABASE_URL is not set." >&2
  exit 1
fi

export DATABASE_URL
export AUDIT_LOG_SIGNING_SECRET
export AUDIT_ANCHOR_SIGNING_SECRET
export AUDIT_ANCHOR_SIGNING_KEY_ID
export AUDIT_ANCHOR_OUTPUT_PATH

node "${SCRIPT_DIR}/export-audit-anchor.mjs"
