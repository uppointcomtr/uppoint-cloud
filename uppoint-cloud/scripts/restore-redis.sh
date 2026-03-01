#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
CONFIRM_FLAG="${2:-}"
REDIS_DATA_DIR="/var/lib/redis"

if [ -z "$BACKUP_FILE" ] || [ "$CONFIRM_FLAG" != "--confirm" ]; then
  echo "Usage: $0 <redis_backup.tar.gz> --confirm" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore-redis] backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "[restore-redis] validating archive..."
tar -tzf "$BACKUP_FILE" >/dev/null

echo "[restore-redis] stopping redis-server..."
systemctl stop redis-server

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; systemctl start redis-server' EXIT

tar -xzf "$BACKUP_FILE" -C "$tmp_dir"

if [ -d "$tmp_dir/appendonlydir" ]; then
  rm -rf "${REDIS_DATA_DIR}/appendonlydir"
  cp -a "$tmp_dir/appendonlydir" "${REDIS_DATA_DIR}/appendonlydir"
fi

if [ -f "$tmp_dir/dump.rdb" ]; then
  cp -a "$tmp_dir/dump.rdb" "${REDIS_DATA_DIR}/dump.rdb"
fi

chown -R redis:redis "${REDIS_DATA_DIR}/appendonlydir" "${REDIS_DATA_DIR}/dump.rdb" 2>/dev/null || true
chmod 600 "${REDIS_DATA_DIR}/dump.rdb" 2>/dev/null || true

echo "[restore-redis] restore files copied. redis-server will be started by trap."
