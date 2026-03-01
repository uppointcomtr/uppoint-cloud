#!/usr/bin/env bash
# Redis günlük yedek scripti
# Çalıştırma: cron tarafından otomatik (her gece)

set -euo pipefail

BACKUP_DIR="/opt/backups/redis"
KEEP_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/redis_${TIMESTAMP}.tar.gz"
TMP_FILE="${BACKUP_FILE}.tmp"

REDIS_DATA_DIR="/var/lib/redis"
RDB_FILE="${REDIS_DATA_DIR}/dump.rdb"
AOF_DIR="${REDIS_DATA_DIR}/appendonlydir"

mkdir -p "$BACKUP_DIR"

if ! redis-cli ping >/dev/null 2>&1; then
  echo "[redis-backup] HATA: redis-cli ping başarısız." >&2
  exit 1
fi

# Persistence dosyalarının güncel olması için arka planda snapshot tetikle.
if redis-cli BGSAVE >/dev/null 2>&1; then
  for _ in $(seq 1 60); do
    IN_PROGRESS=$(redis-cli --raw INFO persistence | awk -F: '/rdb_bgsave_in_progress/{gsub("\r","",$2); print $2}')
    if [ "$IN_PROGRESS" = "0" ]; then
      break
    fi
    sleep 1
  done
fi

if [ ! -f "$RDB_FILE" ] && [ ! -d "$AOF_DIR" ]; then
  echo "[redis-backup] HATA: dump.rdb veya appendonlydir bulunamadı." >&2
  exit 1
fi

tar -C "$REDIS_DATA_DIR" -czf "$TMP_FILE" dump.rdb appendonlydir 2>/dev/null || {
  rm -f "$TMP_FILE"
  echo "[redis-backup] HATA: tar arşivi oluşturulamadı." >&2
  exit 1
}

if [ ! -s "$TMP_FILE" ]; then
  rm -f "$TMP_FILE"
  echo "[redis-backup] HATA: yedek dosyası boş." >&2
  exit 1
fi

if ! tar -tzf "$TMP_FILE" >/dev/null 2>&1; then
  rm -f "$TMP_FILE"
  echo "[redis-backup] HATA: yedek dosyası bozuk." >&2
  exit 1
fi

mv "$TMP_FILE" "$BACKUP_FILE"

echo "[redis-backup] Tamamlandı: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

find "$BACKUP_DIR" -name "redis_*.tar.gz" -mtime +"$KEEP_DAYS" -delete
echo "[redis-backup] Eski yedekler temizlendi (>${KEEP_DAYS} gün)"
