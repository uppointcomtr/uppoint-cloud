#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/uppoint-cloud"
WORKER_ROOT="${APP_ROOT}/workers/incus"
ENV_FILE="${APP_ROOT}/.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

load_worker_env() {
  local key="$1"
  local value

  if [ -n "${!key:-}" ]; then
    return 0
  fi

  value="$(read_env_value "$ENV_FILE" "$key")"
  if [ -n "$value" ]; then
    export "${key}=${value}"
  fi
}

load_worker_env "NEXT_PUBLIC_APP_URL"
load_worker_env "KVM_WORKER_CONTROL_PLANE_URL"
load_worker_env "INTERNAL_PROVISIONING_TOKEN"
load_worker_env "INTERNAL_PROVISIONING_SIGNING_SECRET"
load_worker_env "INTERNAL_AUTH_TRANSPORT_MODE"
load_worker_env "KVM_WORKER_ID"
load_worker_env "KVM_WORKER_BATCH_SIZE"
load_worker_env "KVM_WORKER_LOCK_STALE_SECONDS"
load_worker_env "KVM_OVS_BRIDGE_PREFIX"
load_worker_env "KVM_VLAN_RANGE"
load_worker_env "KVM_WORKER_HTTP_TIMEOUT_SECONDS"
load_worker_env "KVM_WORKER_BINARY_PATH"
load_worker_env "INCUS_SOCKET_PATH"
load_worker_env "INCUS_ENDPOINT"

WORKER_BINARY_PATH="${KVM_WORKER_BINARY_PATH:-${WORKER_ROOT}/bin/incus-worker}"

if [ ! -d "$WORKER_ROOT" ]; then
  echo "[incus-worker] FAIL: worker root not found: ${WORKER_ROOT}" >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "[incus-worker] FAIL: go command not found" >&2
  exit 1
fi

mkdir -p "$(dirname "$WORKER_BINARY_PATH")"

if [ ! -x "$WORKER_BINARY_PATH" ]; then
  echo "[incus-worker] building worker binary at ${WORKER_BINARY_PATH}"
  (
    cd "$WORKER_ROOT"
    go build -o "$WORKER_BINARY_PATH" ./cmd/worker
  )
  chmod 750 "$WORKER_BINARY_PATH"
fi

exec "$WORKER_BINARY_PATH"
