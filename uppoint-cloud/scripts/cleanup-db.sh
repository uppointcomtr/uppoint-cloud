#!/usr/bin/env bash
# Veritabanı temizlik scripti
# Çalıştırma: cron tarafından otomatik (her gece 03:00)
# Görev: Süresi dolmuş rate limit ve auth kayıtlarını temizle

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
AUDIT_LOG_RETENTION_DAYS="${AUDIT_LOG_RETENTION_DAYS:-}"
NOTIFICATION_OUTBOX_RETENTION_DAYS="${NOTIFICATION_OUTBOX_RETENTION_DAYS:-}"

DATABASE_URL="${DATABASE_URL:-$(read_env_value "$ENV_FILE" "DATABASE_URL")}"
if [ -z "${AUDIT_LOG_RETENTION_DAYS:-}" ]; then
  AUDIT_LOG_RETENTION_DAYS="$(read_env_value "$ENV_FILE" "AUDIT_LOG_RETENTION_DAYS")"
fi
if [ -z "${NOTIFICATION_OUTBOX_RETENTION_DAYS:-}" ]; then
  NOTIFICATION_OUTBOX_RETENTION_DAYS="$(read_env_value "$ENV_FILE" "NOTIFICATION_OUTBOX_RETENTION_DAYS")"
fi

AUDIT_LOG_RETENTION_DAYS="${AUDIT_LOG_RETENTION_DAYS:-180}"
NOTIFICATION_OUTBOX_RETENTION_DAYS="${NOTIFICATION_OUTBOX_RETENTION_DAYS:-30}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[cleanup] HATA: DATABASE_URL tanımlı değil." >&2
  exit 1
fi

if ! [[ "$AUDIT_LOG_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$AUDIT_LOG_RETENTION_DAYS" -lt 30 ]; then
  echo "[cleanup] HATA: AUDIT_LOG_RETENTION_DAYS geçersiz (>=30 olmalı)." >&2
  exit 1
fi

if ! [[ "$NOTIFICATION_OUTBOX_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$NOTIFICATION_OUTBOX_RETENTION_DAYS" -lt 1 ]; then
  echo "[cleanup] HATA: NOTIFICATION_OUTBOX_RETENTION_DAYS geçersiz (>=1 olmalı)." >&2
  exit 1
fi

# -A: hizalama yok, -t: başlık yok, -q: sessiz mod
PSQL=(psql "$DATABASE_URL" -A -t -q)

echo "[cleanup] Başlıyor: $(date)"

# 1. RateLimitAttempt — 24 saatten eski kayıtlar
RL_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"RateLimitAttempt\" WHERE \"createdAt\" < NOW() - INTERVAL '24 hours' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] RateLimitAttempt: ${RL_DELETED} satır silindi"

# 2. LoginChallenge — kodu 1 saatten uzun süre önce süresi dolmuş tüm kayıtlar
#    (kullanılmış/kullanılmamış fark etmez; loginToken da en fazla 10dk geçerli)
LC_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"LoginChallenge\" WHERE \"codeExpiresAt\" < NOW() - INTERVAL '1 hour' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] LoginChallenge: ${LC_DELETED} satır silindi"

# 3. PasswordResetToken — süresi dolmuş tokenlar
PRT_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"PasswordResetToken\" WHERE \"expiresAt\" < NOW() RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] PasswordResetToken: ${PRT_DELETED} satır silindi"

# 4. PasswordResetChallenge — tüm expire alanları geçmiş kayıtlar
PRC_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"PasswordResetChallenge\" WHERE \"emailCodeExpiresAt\" < NOW() - INTERVAL '1 hour' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] PasswordResetChallenge: ${PRC_DELETED} satır silindi"

# 5. VerificationToken — süresi dolmuş tokenlar (PK: identifier+token, id yok)
VT_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"VerificationToken\" WHERE \"expires\" < NOW() RETURNING token) SELECT count(*) FROM d;")
echo "[cleanup] VerificationToken: ${VT_DELETED} satır silindi"

# 6. AuditLog — retention süresinden eski kayıtlar
AL_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '${AUDIT_LOG_RETENTION_DAYS} days' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] AuditLog (>${AUDIT_LOG_RETENTION_DAYS} gün): ${AL_DELETED} satır silindi"

# 7. RegistrationVerificationChallenge — süresi dolmuş kayıtlar
RVC_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"RegistrationVerificationChallenge\" WHERE \"emailCodeExpiresAt\" < NOW() - INTERVAL '1 hour' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] RegistrationVerificationChallenge: ${RVC_DELETED} satır silindi"

# 8. RevokedSessionToken — süresi dolmuş JTI blacklist kayıtları
#    (Kod içinde lazy cleanup var ama pasif token'lar asla silinmez; bu tablo şişebilir)
RST_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"RevokedSessionToken\" WHERE \"expiresAt\" < NOW() RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] RevokedSessionToken: ${RST_DELETED} satır silindi"

# 9. IdempotencyRecord — süresi geçmiş kayıtlar
IDR_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"IdempotencyRecord\" WHERE \"expiresAt\" < NOW() RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] IdempotencyRecord: ${IDR_DELETED} satır silindi"

# 10. NotificationOutbox — gönderilmiş/kalıcı hataya düşmüş eski kayıtlar
NO_DELETED=$("${PSQL[@]}" -c "SELECT CASE WHEN to_regclass('\"NotificationOutbox\"') IS NULL THEN 0 ELSE (WITH d AS (DELETE FROM \"NotificationOutbox\" WHERE \"status\" IN ('SENT','FAILED') AND \"updatedAt\" < NOW() - INTERVAL '${NOTIFICATION_OUTBOX_RETENTION_DAYS} days' RETURNING id) SELECT count(*) FROM d) END;")
echo "[cleanup] NotificationOutbox (>${NOTIFICATION_OUTBOX_RETENTION_DAYS} gün): ${NO_DELETED} satır silindi"

echo "[cleanup] Tamamlandı: $(date)"
