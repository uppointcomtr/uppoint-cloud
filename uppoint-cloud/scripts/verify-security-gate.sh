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
npm run build

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

case "${SECURITY_GATE_REQUIRE_REMOTE_SMOKE:-0}" in
  1|true|TRUE|yes|YES)
    echo "[security-gate] remote smoke verification (read-only)"
    E2E_ALLOW_MUTATIONS=0 npm run test:e2e:remote
    ;;
  *)
    echo "[security-gate] skip remote smoke verification (SECURITY_GATE_REQUIRE_REMOTE_SMOKE is not enabled)"
    ;;
esac

echo "[security-gate] completed successfully"
