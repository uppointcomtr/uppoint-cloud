#!/usr/bin/env bash
# Veritabanı temizlik scripti
# Çalıştırma: cron tarafından otomatik (her gece 03:00)
# Görev: Süresi dolmuş rate limit ve auth kayıtlarını temizle

set -euo pipefail

PGPASSFILE="/root/.pgpass"
export PGPASSFILE

# -A: hizalama yok, -t: başlık yok, -q: sessiz mod
PSQL="psql -h localhost -U uppoint_user -d uppoint_cloud -A -t -q"

echo "[cleanup] Başlıyor: $(date)"

# 1. RateLimitAttempt — 24 saatten eski kayıtlar
RL_DELETED=$($PSQL -c "WITH d AS (DELETE FROM \"RateLimitAttempt\" WHERE \"createdAt\" < NOW() - INTERVAL '24 hours' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] RateLimitAttempt: ${RL_DELETED} satır silindi"

# 2. LoginChallenge — kodu 1 saatten uzun süre önce süresi dolmuş tüm kayıtlar
#    (kullanılmış/kullanılmamış fark etmez; loginToken da en fazla 10dk geçerli)
LC_DELETED=$($PSQL -c "WITH d AS (DELETE FROM \"LoginChallenge\" WHERE \"codeExpiresAt\" < NOW() - INTERVAL '1 hour' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] LoginChallenge: ${LC_DELETED} satır silindi"

# 3. PasswordResetToken — süresi dolmuş tokenlar
PRT_DELETED=$($PSQL -c "WITH d AS (DELETE FROM \"PasswordResetToken\" WHERE \"expiresAt\" < NOW() RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] PasswordResetToken: ${PRT_DELETED} satır silindi"

# 4. PasswordResetChallenge — tüm expire alanları geçmiş kayıtlar
PRC_DELETED=$($PSQL -c "WITH d AS (DELETE FROM \"PasswordResetChallenge\" WHERE \"emailCodeExpiresAt\" < NOW() - INTERVAL '1 hour' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] PasswordResetChallenge: ${PRC_DELETED} satır silindi"

# 5. VerificationToken — süresi dolmuş tokenlar (PK: identifier+token, id yok)
VT_DELETED=$($PSQL -c "WITH d AS (DELETE FROM \"VerificationToken\" WHERE \"expires\" < NOW() RETURNING token) SELECT count(*) FROM d;")
echo "[cleanup] VerificationToken: ${VT_DELETED} satır silindi"

# 6. AuditLog — 90 günden eski kayıtlar
AL_DELETED=$($PSQL -c "WITH d AS (DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '90 days' RETURNING id) SELECT count(*) FROM d;")
echo "[cleanup] AuditLog (>90 gün): ${AL_DELETED} satır silindi"

echo "[cleanup] Tamamlandı: $(date)"
