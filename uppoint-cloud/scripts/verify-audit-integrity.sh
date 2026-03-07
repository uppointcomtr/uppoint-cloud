#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"

DATABASE_URL="${DATABASE_URL:-}"
AUDIT_LOG_SIGNING_SECRET="${AUDIT_LOG_SIGNING_SECRET:-}"
AUDIT_LOG_SIGNING_SECRET_LEGACY="${AUDIT_LOG_SIGNING_SECRET_LEGACY:-}"
AUDIT_INTEGRITY_CHAIN_STRICT_SINCE="${AUDIT_INTEGRITY_CHAIN_STRICT_SINCE:-}"
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(read_env_value "$ENV_FILE" "DATABASE_URL")"
fi
if [ -z "$AUDIT_LOG_SIGNING_SECRET" ]; then
  AUDIT_LOG_SIGNING_SECRET="$(read_env_value "$ENV_FILE" "AUDIT_LOG_SIGNING_SECRET")"
fi
if [ -z "$AUDIT_LOG_SIGNING_SECRET_LEGACY" ]; then
  AUDIT_LOG_SIGNING_SECRET_LEGACY="$(read_env_value "$ENV_FILE" "AUDIT_LOG_SIGNING_SECRET_LEGACY")"
fi
if [ -z "$AUDIT_INTEGRITY_CHAIN_STRICT_SINCE" ]; then
  AUDIT_INTEGRITY_CHAIN_STRICT_SINCE="$(read_env_value "$ENV_FILE" "AUDIT_INTEGRITY_CHAIN_STRICT_SINCE")"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[audit-integrity] DATABASE_URL is not set." >&2
  exit 1
fi

export DATABASE_URL
export AUDIT_LOG_SIGNING_SECRET
export AUDIT_LOG_SIGNING_SECRET_LEGACY
export AUDIT_INTEGRITY_CHAIN_STRICT_SINCE
node "${SCRIPT_DIR}/verify-audit-integrity.mjs"
