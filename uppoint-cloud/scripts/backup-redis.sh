#!/usr/bin/env bash
# Redis günlük yedek scripti
# Çalıştırma: cron tarafından otomatik (her gece)

set -euo pipefail
umask 077

BACKUP_DIR="/opt/backups/redis"
KEEP_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/redis_${TIMESTAMP}.tar.gz"
TMP_FILE="${BACKUP_FILE}.tmp"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

REDIS_DATA_DIR="/var/lib/redis"
RDB_FILE="${REDIS_DATA_DIR}/dump.rdb"
AOF_DIR="${REDIS_DATA_DIR}/appendonlydir"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

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
chmod 600 "$BACKUP_FILE"

sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
chmod 600 "$CHECKSUM_FILE"

echo "[redis-backup] Tamamlandı: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"
echo "[redis-backup] Checksum: $CHECKSUM_FILE"

while IFS= read -r expired_backup; do
  rm -f "$expired_backup" "${expired_backup}.sha256"
done < <(find "$BACKUP_DIR" -name "redis_*.tar.gz" -mtime +"$KEEP_DAYS")

echo "[redis-backup] Eski yedekler temizlendi (>${KEEP_DAYS} gün)"
