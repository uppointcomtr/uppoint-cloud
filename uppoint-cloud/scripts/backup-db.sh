#!/usr/bin/env bash
# PostgreSQL günlük backup scripti
# Çalıştırma: cron tarafından otomatik (her gece 02:00)

set -euo pipefail
umask 077

BACKUP_DIR="/opt/backups/postgres"
ENV_FILE="/opt/uppoint-cloud/.env"
KEEP_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d '=' -f2-)"
fi

# Optional quote cleanup: DATABASE_URL="..." or DATABASE_URL='...'
if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"
  DATABASE_URL="${DATABASE_URL#\'}"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] HATA: DATABASE_URL tanımlı değil." >&2
  exit 1
fi

DB_NAME_FROM_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://[^/]+/([^?]+).*$#\1#')"
DB_NAME="${DB_NAME_FROM_URL:-database}"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
TMP_FILE="${BACKUP_FILE}.tmp"

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

echo "[backup] Tamamlandı: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# 14 günden eski yedekleri sil
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[backup] Eski yedekler temizlendi (>${KEEP_DAYS} gün)"
