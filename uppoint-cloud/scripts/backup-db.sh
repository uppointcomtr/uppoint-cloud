#!/usr/bin/env bash
# PostgreSQL günlük backup scripti
# Çalıştırma: cron tarafından otomatik (her gece 02:00)

set -euo pipefail

BACKUP_DIR="/opt/backups/postgres"
DB_NAME="uppoint_cloud"
DB_USER="uppoint_user"
KEEP_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
TMP_FILE="${BACKUP_FILE}.tmp"

mkdir -p "$BACKUP_DIR"

# pg_dump ile yedek al; önce geçici dosyaya yaz
PGPASSFILE="/root/.pgpass" pg_dump \
  -h localhost \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip > "$TMP_FILE"

# Boş dosya kontrolü
if [ ! -s "$TMP_FILE" ]; then
  rm -f "$TMP_FILE"
  echo "[backup] HATA: Backup dosyası boş, pg_dump başarısız olmuş olabilir." >&2
  exit 1
fi

# Gzip bütünlük kontrolü
if ! gzip -t "$TMP_FILE" 2>/dev/null; then
  rm -f "$TMP_FILE"
  echo "[backup] HATA: Backup dosyası bozuk (gzip integrity check başarısız)." >&2
  exit 1
fi

# Geçici dosyayı kalıcı konuma taşı (atomic)
mv "$TMP_FILE" "$BACKUP_FILE"

echo "[backup] Tamamlandı: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# 14 günden eski yedekleri sil
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[backup] Eski yedekler temizlendi (>${KEEP_DAYS} gün)"
