#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"
ENV_FILE="${PROJECT_ROOT}/.env"

cd "${PROJECT_ROOT}"

echo "[security-gate] baseline verification: lint + typecheck + tests + build"
npm run lint
npm run typecheck
npm run test

SECURITY_GATE_BUILD_ENV_FILE="${SECURITY_GATE_BUILD_ENV_FILE:-}"
if [ -n "${SECURITY_GATE_BUILD_ENV_FILE}" ]; then
  if [ ! -f "${SECURITY_GATE_BUILD_ENV_FILE}" ]; then
    echo "[security-gate] configured SECURITY_GATE_BUILD_ENV_FILE does not exist: ${SECURITY_GATE_BUILD_ENV_FILE}" >&2
    exit 1
  fi

  echo "[security-gate] build verification with isolated env file: ${SECURITY_GATE_BUILD_ENV_FILE}"
  (
    set -a
    # shellcheck disable=SC1090
    source "${SECURITY_GATE_BUILD_ENV_FILE}"
    set +a
    npm run build
  )
else
  npm run build
fi

echo "[security-gate] findings register freshness verification"
npm run verify:findings-freshness

echo "[security-gate] contract guardrails: workflow layout + repo layout"
npm run verify:workflow-layout
npm run verify:repo-layout

AUDIT_INTEGRITY_DATABASE_URL="${AUDIT_INTEGRITY_DATABASE_URL:-}"
DATABASE_URL="${DATABASE_URL:-}"
if [ -z "${AUDIT_INTEGRITY_DATABASE_URL}" ]; then
  AUDIT_INTEGRITY_DATABASE_URL="$(read_env_value "${ENV_FILE}" "AUDIT_INTEGRITY_DATABASE_URL")"
fi
if [ -z "${DATABASE_URL}" ]; then
  DATABASE_URL="$(read_env_value "${ENV_FILE}" "DATABASE_URL")"
fi

if [ -n "${AUDIT_INTEGRITY_DATABASE_URL}" ]; then
  echo "[security-gate] audit integrity verification via AUDIT_INTEGRITY_DATABASE_URL"
  DATABASE_URL="${AUDIT_INTEGRITY_DATABASE_URL}" npm run verify:audit-integrity
elif [ -n "${DATABASE_URL}" ]; then
  echo "[security-gate] audit integrity verification via DATABASE_URL"
  DATABASE_URL="${DATABASE_URL}" npm run verify:audit-integrity
else
  echo "[security-gate] skip verify:audit-integrity (DATABASE_URL/AUDIT_INTEGRITY_DATABASE_URL is not set)"
fi

if [ -n "${DATABASE_URL}" ] || [ -n "${AUDIT_INTEGRITY_DATABASE_URL}" ]; then
  echo "[security-gate] security SLO verification"
  if [ -n "${AUDIT_INTEGRITY_DATABASE_URL}" ]; then
    DATABASE_URL="${AUDIT_INTEGRITY_DATABASE_URL}" npm run verify:security-slo
  else
    DATABASE_URL="${DATABASE_URL}" npm run verify:security-slo
  fi
else
  echo "[security-gate] skip verify:security-slo (DATABASE_URL/AUDIT_INTEGRITY_DATABASE_URL is not set)"
fi

if [ -f "/etc/nginx/conf.d/uppoint-rate-limit.conf" ]; then
  echo "[security-gate] nginx drift verification"
  RATE_LIMIT_DRIFT_POLICY="${RATE_LIMIT_DRIFT_POLICY:-enforce-baseline}" npm run verify:nginx-drift
else
  echo "[security-gate] skip verify:nginx-drift (/etc/nginx/conf.d/uppoint-rate-limit.conf not found)"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl cat uppoint-cloud.service >/dev/null 2>&1; then
  echo "[security-gate] edge-audit emit verification"
  npm run verify:edge-audit-emit
else
  echo "[security-gate] skip verify:edge-audit-emit (uppoint-cloud.service not available)"
fi

if ls /opt/backups/postgres/*.sql.gz >/dev/null 2>&1; then
  echo "[security-gate] restore drill artifact verification"
  npm run verify:restore-drill
  echo "[security-gate] restore drill freshness verification"
  npm run verify:restore-drill-freshness
else
  echo "[security-gate] skip verify:restore-drill (no postgres backup artifact found)"
fi

EFFECTIVE_NODE_ENV="${NODE_ENV:-}"
if [ -z "${EFFECTIVE_NODE_ENV}" ]; then
  EFFECTIVE_NODE_ENV="$(read_env_value "${ENV_FILE}" "NODE_ENV")"
fi
if [ -z "${EFFECTIVE_NODE_ENV}" ]; then
  EFFECTIVE_NODE_ENV="development"
fi

REMOTE_SMOKE_REQUIRED="${SECURITY_GATE_REQUIRE_REMOTE_SMOKE:-1}"
case "${REMOTE_SMOKE_REQUIRED}" in
  1|true|TRUE|yes|YES)
    echo "[security-gate] remote smoke verification (read-only)"
    E2E_ALLOW_MUTATIONS=0 npm run test:e2e:remote
    ;;
  0|false|FALSE|no|NO)
    if [ "${EFFECTIVE_NODE_ENV}" = "production" ]; then
      echo "[security-gate] refusing to skip remote smoke in production (SECURITY_GATE_REQUIRE_REMOTE_SMOKE=0)" >&2
      exit 1
    fi
    echo "[security-gate] skip remote smoke verification (explicit override in non-production)"
    ;;
  *)
    echo "[security-gate] invalid SECURITY_GATE_REQUIRE_REMOTE_SMOKE value: ${REMOTE_SMOKE_REQUIRED}" >&2
    exit 1
    ;;
esac

echo "[security-gate] completed successfully"
