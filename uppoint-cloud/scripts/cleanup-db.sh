#!/usr/bin/env bash
# Veritabanı temizlik scripti
# Çalıştırma: cron tarafından otomatik (her gece 03:00)
# Görev: Süresi dolmuş rate limit ve auth kayıtlarını temizle

set -euo pipefail

PGPASSFILE="/root/.pgpass"
export PGPASSFILE

PSQL="psql -h localhost -U uppoint_user -d uppoint_cloud -t -c"

echo "[cleanup] Başlıyor: $(date)"

# 24 saatten eski rate limit kayıtlarını sil
RL_DELETED=$($PSQL "DELETE FROM \"RateLimitAttempt\" WHERE \"createdAt\" < NOW() - INTERVAL '24 hours'; SELECT ROW_COUNT();" 2>/dev/null | tr -d ' ' || echo "0")
echo "[cleanup] RateLimitAttempt: ${RL_DELETED} satır silindi"

# Süresi dolmuş login challenge'ları sil (1 saatten eski)
LC_DELETED=$($PSQL "DELETE FROM \"LoginChallenge\" WHERE \"codeExpiresAt\" < NOW() - INTERVAL '1 hour' AND \"loginTokenUsedAt\" IS NOT NULL; SELECT ROW_COUNT();" 2>/dev/null | tr -d ' ' || echo "0")
echo "[cleanup] LoginChallenge (kullanılmış): ${LC_DELETED} satır silindi"

# 90 günden eski audit log kayıtlarını sil
AL_DELETED=$($PSQL "DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '90 days'; SELECT ROW_COUNT();" 2>/dev/null | tr -d ' ' || echo "0")
echo "[cleanup] AuditLog (>90 gün): ${AL_DELETED} satır silindi"

echo "[cleanup] Tamamlandı: $(date)"
