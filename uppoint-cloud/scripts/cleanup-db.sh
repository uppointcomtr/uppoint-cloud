#!/usr/bin/env bash
# Veritabanı temizlik scripti
# Çalıştırma: cron tarafından otomatik (her gece 03:00)
# Görev: Süresi dolmuş rate limit ve auth kayıtlarını temizle

set -euo pipefail

ENV_FILE="/opt/uppoint-cloud/.env"

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
  echo "[cleanup] HATA: DATABASE_URL tanımlı değil." >&2
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

# 6. AuditLog — 90 günden eski kayıtlar
AL_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '90 days' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] AuditLog (>90 gün): ${AL_DELETED} satır silindi"

# 7. RegistrationVerificationChallenge — süresi dolmuş kayıtlar
RVC_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"RegistrationVerificationChallenge\" WHERE \"emailCodeExpiresAt\" < NOW() - INTERVAL '1 hour' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] RegistrationVerificationChallenge: ${RVC_DELETED} satır silindi"

# 8. RevokedSessionToken — süresi dolmuş JTI blacklist kayıtları
#    (Kod içinde lazy cleanup var ama pasif token'lar asla silinmez; bu tablo şişebilir)
RST_DELETED=$("${PSQL[@]}" -c "WITH d AS (DELETE FROM \"RevokedSessionToken\" WHERE \"expiresAt\" < NOW() RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] RevokedSessionToken: ${RST_DELETED} satır silindi"

echo "[cleanup] Tamamlandı: $(date)"
