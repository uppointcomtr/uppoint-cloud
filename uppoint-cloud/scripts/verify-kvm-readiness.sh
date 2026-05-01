#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/uppoint-cloud}"
ENV_FILE="${APP_ROOT}/.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

MODE="strict"
if [ "${1:-}" = "--worker-preflight" ]; then
  MODE="worker-preflight"
fi

failures=0
warnings=0

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

pass() {
  printf '[kvm-readiness] PASS: %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf '[kvm-readiness] WARN: %s\n' "$1" >&2
}

fail() {
  failures=$((failures + 1))
  printf '[kvm-readiness] FAIL: %s\n' "$1" >&2
}

is_loopback_url() {
  URL_TO_CHECK="$1" node - <<'NODE'
const raw = process.env.URL_TO_CHECK || "";
try {
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    process.exit(0);
  }
} catch {
  process.exit(2);
}
process.exit(1);
NODE
}

check_command() {
  local command="$1"
  if command -v "$command" >/dev/null 2>&1; then
    pass "${command} command exists"
  else
    fail "${command} command is missing"
  fi
}

NODE_ENV_VALUE="$(read_config NODE_ENV development)"
TRANSPORT_MODE="$(read_config INTERNAL_AUTH_TRANSPORT_MODE loopback-hmac-v1)"
CONTROL_PLANE_URL="$(read_config KVM_WORKER_CONTROL_PLANE_URL "$(read_config NEXT_PUBLIC_APP_URL "")")"
STORAGE_POOL="$(read_config KVM_INCUS_STORAGE_POOL default)"
ALLOW_DIR_STORAGE="$(read_config KVM_WORKER_ALLOW_DIR_STORAGE false)"
MIN_FREE_DISK_GB="$(read_config KVM_MIN_FREE_DISK_GB 20)"
MIN_FREE_MEMORY_MB="$(read_config KVM_MIN_FREE_MEMORY_MB 1024)"

check_command go
check_command incus
check_command ovs-vsctl

if [ -e /dev/kvm ]; then
  pass "/dev/kvm exists"
else
  fail "/dev/kvm is missing"
fi

if incus version >/dev/null 2>&1; then
  pass "Incus daemon is reachable"
else
  fail "Incus daemon is not reachable"
fi

if ovs-vsctl show >/dev/null 2>&1; then
  pass "Open vSwitch is reachable"
else
  fail "Open vSwitch is not reachable"
fi

if [ -n "$(read_config INTERNAL_PROVISIONING_TOKEN "")" ]; then
  pass "INTERNAL_PROVISIONING_TOKEN is configured"
else
  fail "INTERNAL_PROVISIONING_TOKEN is missing"
fi

if [ -n "$(read_config INTERNAL_PROVISIONING_SIGNING_SECRET "")" ]; then
  pass "INTERNAL_PROVISIONING_SIGNING_SECRET is configured"
else
  fail "INTERNAL_PROVISIONING_SIGNING_SECRET is missing"
fi

if [ -n "$(read_config INCUS_SOCKET_PATH "")" ] || [ -n "$(read_config INCUS_ENDPOINT "")" ]; then
  pass "Incus endpoint configuration is present"
else
  fail "INCUS_SOCKET_PATH or INCUS_ENDPOINT must be configured"
fi

if [ "$TRANSPORT_MODE" = "loopback-hmac-v1" ]; then
  if [ -n "$CONTROL_PLANE_URL" ] && is_loopback_url "$CONTROL_PLANE_URL"; then
    pass "worker control-plane URL is loopback for loopback-hmac-v1"
  else
    fail "KVM_WORKER_CONTROL_PLANE_URL must be loopback when INTERNAL_AUTH_TRANSPORT_MODE=loopback-hmac-v1"
  fi
fi

if [ "$MODE" = "strict" ]; then
  if [ -f /etc/cron.d/uppoint-incus-provisioning ]; then
    pass "Incus provisioning cron is installed"
  else
    fail "/etc/cron.d/uppoint-incus-provisioning is missing"
  fi
fi

storage_driver=""
storage_source=""
if command -v incus >/dev/null 2>&1 && incus storage show "$STORAGE_POOL" >/tmp/uppoint-incus-storage-readiness.$$ 2>/dev/null; then
  storage_driver="$(awk -F: '$1 == "driver" { gsub(/^[ \t]+/, "", $2); print $2; exit }' /tmp/uppoint-incus-storage-readiness.$$)"
  storage_source="$(awk -F: '$1 == "source" { gsub(/^[ \t]+/, "", $2); print $2; exit }' /tmp/uppoint-incus-storage-readiness.$$)"
  rm -f /tmp/uppoint-incus-storage-readiness.$$
else
  rm -f /tmp/uppoint-incus-storage-readiness.$$
fi

if [ -n "$storage_driver" ]; then
  pass "Incus storage pool ${STORAGE_POOL} uses driver=${storage_driver}"
  if [ "$NODE_ENV_VALUE" = "production" ] && [ "$storage_driver" = "dir" ] && [ "$ALLOW_DIR_STORAGE" != "true" ]; then
    fail "production worker refuses dir storage unless KVM_WORKER_ALLOW_DIR_STORAGE=true is explicitly set"
  fi
else
  fail "Incus storage pool ${STORAGE_POOL} could not be inspected"
fi

storage_path="${storage_source:-/var/lib/incus}"
if [ -d "$storage_path" ]; then
  free_kb="$(df -Pk "$storage_path" | awk 'NR == 2 { print $4 }')"
  free_gb=$((free_kb / 1024 / 1024))
  if [ "$free_gb" -ge "$MIN_FREE_DISK_GB" ]; then
    pass "storage free space is ${free_gb}GiB"
  else
    fail "storage free space is ${free_gb}GiB, below ${MIN_FREE_DISK_GB}GiB"
  fi
else
  warn "storage source path ${storage_path} does not exist on this host"
fi

if [ -r /proc/meminfo ]; then
  mem_available_kb="$(awk '$1 == "MemAvailable:" { print $2; exit }' /proc/meminfo)"
  mem_available_mb=$((mem_available_kb / 1024))
  if [ "$mem_available_mb" -ge "$MIN_FREE_MEMORY_MB" ]; then
    pass "available memory is ${mem_available_mb}MiB"
  else
    fail "available memory is ${mem_available_mb}MiB, below ${MIN_FREE_MEMORY_MB}MiB"
  fi
else
  warn "/proc/meminfo is not readable"
fi

DATABASE_URL_VALUE="$(read_config DATABASE_URL "")"
if [ -n "$DATABASE_URL_VALUE" ] && command -v psql >/dev/null 2>&1; then
  configure_postgres_connection "$DATABASE_URL_VALUE"
  queue_summary="$(
    psql -Atq 2>/dev/null <<'SQL' || true
SELECT "status"::text || '|' || count(*)::text
FROM "InstanceProvisioningJob"
GROUP BY "status"
ORDER BY "status";
SQL
  )"
  if [ -n "$queue_summary" ]; then
    printf '[kvm-readiness] INFO: provisioning queue summary:\n%s\n' "$queue_summary"
  else
    printf '[kvm-readiness] INFO: provisioning queue summary empty or unavailable\n'
  fi
else
  warn "DATABASE_URL or psql unavailable; skipping queue summary"
fi

if [ "$failures" -gt 0 ]; then
  printf '[kvm-readiness] RESULT: fail (%d failures, %d warnings)\n' "$failures" "$warnings" >&2
  exit 1
fi

printf '[kvm-readiness] RESULT: pass (%d warnings)\n' "$warnings"
