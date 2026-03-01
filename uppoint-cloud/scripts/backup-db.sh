#!/usr/bin/env bash
# PostgreSQL günlük backup scripti
# Çalıştırma: cron tarafından otomatik (her gece 02:00)

set -euo pipefail
umask 077

BACKUP_DIR="/opt/backups/postgres"
ENV_FILE="/opt/uppoint-cloud/.env"
KEEP_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

load_env_file() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

load_env_file

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] HATA: DATABASE_URL tanımlı değil." >&2
  exit 1
fi

DB_NAME_FROM_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://[^/]+/([^?]+).*$#\1#')"
DB_NAME="${DB_NAME_FROM_URL:-database}"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
TMP_FILE="${BACKUP_FILE}.tmp"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# pg_dump ile yedek al; önce geçici dosyaya yaz
pg_dump "$DATABASE_URL" \
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
chmod 600 "$BACKUP_FILE"

# Checksum üret (restore öncesi doğrulama için)
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
chmod 600 "$CHECKSUM_FILE"

echo "[backup] Tamamlandı: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"
echo "[backup] Checksum: $CHECKSUM_FILE"

# 14 günden eski yedekleri sil
while IFS= read -r expired_backup; do
  rm -f "$expired_backup" "${expired_backup}.sha256"
done < <(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS")

echo "[backup] Eski yedekler temizlendi (>${KEEP_DAYS} gün)"
