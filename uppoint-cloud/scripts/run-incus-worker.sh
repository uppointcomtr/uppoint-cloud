#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/uppoint-cloud"
WORKER_ROOT="${APP_ROOT}/workers/incus"
ENV_FILE="${APP_ROOT}/.env"
WORKER_BINARY_PATH="${KVM_WORKER_BINARY_PATH:-${WORKER_ROOT}/bin/incus-worker}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

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
