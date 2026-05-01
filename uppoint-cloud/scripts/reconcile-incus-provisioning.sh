#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/uppoint-cloud}"
ENV_FILE="${APP_ROOT}/.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

MODE="dry-run"
if [ "${1:-}" = "--execute" ]; then
  MODE="execute"
fi

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

log() {
  printf '[incus-reconcile] %s\n' "$1"
}

if [ "$MODE" = "execute" ] && [ "$(read_config UPPOINT_ENABLE_KVM_RECONCILIATION_EXECUTE false)" != "true" ]; then
  log "refusing execute mode: UPPOINT_ENABLE_KVM_RECONCILIATION_EXECUTE=true is required"
  exit 1
fi

BRIDGE_PREFIX="$(read_config KVM_OVS_BRIDGE_PREFIX upkvm)"
DATABASE_URL_VALUE="$(read_config DATABASE_URL "")"

log "mode=${MODE}"
log "bridgePrefix=${BRIDGE_PREFIX}"

if command -v ovs-vsctl >/dev/null 2>&1; then
  while IFS= read -r bridge; do
    [ -n "$bridge" ] || continue
    case "$bridge" in
      "${BRIDGE_PREFIX}"*) ;;
      *) continue ;;
    esac

    log "checking bridge ${bridge}"
    port_count=0
    while IFS= read -r port; do
      [ -n "$port" ] || continue
      port_count=$((port_count + 1))
      if ip link show "$port" >/dev/null 2>&1; then
        log "port ${port} exists"
      else
        log "stale OVS port detected: bridge=${bridge} port=${port}"
        if [ "$MODE" = "execute" ]; then
          ovs-vsctl --if-exists del-port "$bridge" "$port"
          log "deleted stale OVS port ${port}"
        fi
      fi
    done < <(ovs-vsctl list-ports "$bridge" 2>/dev/null || true)

    if [ "$port_count" -eq 0 ]; then
      log "empty OVS bridge detected: ${bridge}"
      if [ "$MODE" = "execute" ] && [ "$(read_config KVM_RECONCILE_DELETE_EMPTY_BRIDGES false)" = "true" ]; then
        ovs-vsctl --if-exists del-br "$bridge"
        log "deleted empty OVS bridge ${bridge}"
      fi
    fi
  done < <(ovs-vsctl list-br 2>/dev/null || true)
else
  log "ovs-vsctl unavailable; skipping OVS reconciliation"
fi

if [ -n "$DATABASE_URL_VALUE" ] && command -v psql >/dev/null 2>&1; then
  configure_postgres_connection "$DATABASE_URL_VALUE"

  log "DB VLAN allocation drift candidates:"
  psql -Atq <<'SQL' || true
SELECT k."id" || '|' || k."networkId" || '|' || k."bridgeName" || '|' || k."ovsNetworkName"
FROM "KvmVlanAllocation" k
LEFT JOIN "VirtualNetwork" n ON n."id" = k."networkId"
LEFT JOIN "ResourceGroup" rg ON rg."id" = k."resourceGroupId"
WHERE n."id" IS NULL
  OR n."deletedAt" IS NOT NULL
  OR rg."id" IS NULL
  OR rg."deletedAt" IS NOT NULL
ORDER BY k."createdAt" ASC;
SQL

  log "Incus provider refs without completed DB instance:"
  if command -v incus >/dev/null 2>&1; then
    tmp_refs="$(mktemp)"
    psql -Atq > "$tmp_refs" <<'SQL' || true
SELECT COALESCE("providerInstanceRef", '')
FROM "CloudInstance"
WHERE "deletedAt" IS NULL
  AND "providerInstanceRef" IS NOT NULL
  AND "lifecycleStatus" IN ('RUNNING', 'COMPLETED');
SQL

    while IFS= read -r instance_name; do
      [ -n "$instance_name" ] || continue
      provider_ref="incus/${instance_name}"
      if ! grep -Fxq "$provider_ref" "$tmp_refs"; then
        log "orphan Incus instance candidate: ${instance_name}"
      fi
    done < <(incus list --format csv -c n 2>/dev/null || true)
    rm -f "$tmp_refs"
  else
    log "incus unavailable; skipping Incus instance drift scan"
  fi
else
  log "DATABASE_URL or psql unavailable; skipping DB reconciliation scan"
fi

if [ "$MODE" = "dry-run" ]; then
  log "dry-run complete; no resources were changed"
fi
