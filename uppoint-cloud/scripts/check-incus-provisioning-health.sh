#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/uppoint-cloud}"
ENV_FILE="${APP_ROOT}/.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

failures=0

read_config() {
  local key="$1"
  local fallback="${2:-}"
  local value="${!key:-}"

  if [ -z "$value" ]; then
    value="$(read_env_value "$ENV_FILE" "$key")"
  fi

  if [ -z "$value" ]; then
    value="$fallback"
  fi

  printf '%s' "$value"
}

metric() {
  printf '[incus-health] %s=%s\n' "$1" "$2"
}

fail() {
  failures=$((failures + 1))
  printf '[incus-health] FAIL: %s\n' "$1" >&2
}

warn() {
  printf '[incus-health] WARN: %s\n' "$1" >&2
}

PENDING_MAX_AGE_SECONDS="$(read_config KVM_HEALTH_PENDING_MAX_AGE_SECONDS 900)"
LOCK_STALE_SECONDS="$(read_config KVM_WORKER_LOCK_STALE_SECONDS 180)"
BRIDGE_PREFIX="$(read_config KVM_OVS_BRIDGE_PREFIX upkvm)"
DATABASE_URL_VALUE="$(read_config DATABASE_URL "")"

if command -v incus >/dev/null 2>&1 && incus version >/dev/null 2>&1; then
  metric "incus_reachable" "1"
else
  metric "incus_reachable" "0"
  fail "Incus daemon is not reachable"
fi

if [ -f /etc/cron.d/uppoint-incus-provisioning ]; then
  metric "worker_cron_installed" "1"
else
  metric "worker_cron_installed" "0"
  warn "worker cron is not installed"
fi

stale_ports=0
if command -v ovs-vsctl >/dev/null 2>&1; then
  while IFS= read -r bridge; do
    [ -n "$bridge" ] || continue
    case "$bridge" in
      "${BRIDGE_PREFIX}"*) ;;
      *) continue ;;
    esac
    while IFS= read -r port; do
      [ -n "$port" ] || continue
      if ! ip link show "$port" >/dev/null 2>&1; then
        stale_ports=$((stale_ports + 1))
      fi
    done < <(ovs-vsctl list-ports "$bridge" 2>/dev/null || true)
  done < <(ovs-vsctl list-br 2>/dev/null || true)
else
  warn "ovs-vsctl unavailable"
fi
metric "ovs_stale_ports" "$stale_ports"
if [ "$stale_ports" -gt 0 ]; then
  fail "stale OVS ports detected"
fi

if [ -n "$DATABASE_URL_VALUE" ] && command -v psql >/dev/null 2>&1; then
  configure_postgres_connection "$DATABASE_URL_VALUE"

  psql -Atq <<'SQL' | while IFS= read -r line; do
SELECT lower("status"::text) || '_jobs=' || count(*)::text
FROM "InstanceProvisioningJob"
GROUP BY "status"
ORDER BY "status";
SQL
    [ -n "$line" ] && printf '[incus-health] %s\n' "$line"
  done

  oldest_pending_age="$(
    psql -Atq -v ON_ERROR_STOP=1 <<'SQL'
SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN("createdAt")))::int, 0)
FROM "InstanceProvisioningJob"
WHERE "status" = 'PENDING';
SQL
  )"
  metric "oldest_pending_age_seconds" "$oldest_pending_age"
  if [ "$oldest_pending_age" -gt "$PENDING_MAX_AGE_SECONDS" ]; then
    fail "oldest pending provisioning job is older than ${PENDING_MAX_AGE_SECONDS}s"
  fi

  stuck_locks="$(
    psql -Atq -v ON_ERROR_STOP=1 -v lock_stale_seconds="$LOCK_STALE_SECONDS" <<'SQL'
SELECT count(*)
FROM "InstanceProvisioningJob"
WHERE "status" = 'RUNNING'
  AND "lockedAt" IS NOT NULL
  AND "lockedAt" < NOW() - (:'lock_stale_seconds' || ' seconds')::interval;
SQL
  )"
  metric "stuck_locks" "$stuck_locks"
  if [ "$stuck_locks" -gt 0 ]; then
    fail "stuck provisioning locks detected"
  fi

  failed_last_hour="$(
    psql -Atq -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*)
FROM "InstanceProvisioningEvent"
WHERE "eventType" = 'provisioning_failed'
  AND "createdAt" >= NOW() - INTERVAL '1 hour';
SQL
  )"
  metric "failed_events_last_hour" "$failed_last_hour"
else
  warn "DATABASE_URL or psql unavailable; skipping DB health checks"
fi

log_path="/var/log/uppoint-cloud/incus-provisioning-worker.log"
if [ -f "$log_path" ]; then
  log_age_seconds=$(( $(date +%s) - $(stat -c %Y "$log_path") ))
  metric "worker_log_age_seconds" "$log_age_seconds"
else
  warn "worker log is missing: ${log_path}"
fi

if [ "$failures" -gt 0 ]; then
  printf '[incus-health] RESULT=fail failures=%d\n' "$failures" >&2
  exit 1
fi

printf '[incus-health] RESULT=pass\n'
