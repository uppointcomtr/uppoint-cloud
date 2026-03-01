#!/usr/bin/env bash
# /opt/uppoint-cloud/scripts/tune-system.sh
#
# Sunucunun donanım bilgisine göre tüm katmanları otomatik olarak ayarlar:
#   • PostgreSQL bellek parametreleri  → /etc/postgresql/17/main/conf.d/99-uppoint-tuned.conf
#   • Node.js heap boyutu              → /etc/uppoint-cloud-tuned.env  (systemd EnvironmentFile)
#   • Kernel ağ parametreleri          → /etc/sysctl.d/99-uppoint-tuned.conf
#   • Nginx worker_connections         → /etc/nginx/conf.d/99-uppoint-tuned.conf
#
# Çalıştırma:
#   sudo bash /opt/uppoint-cloud/scripts/tune-system.sh    # manuel (donanım yükseltme sonrası)
#   systemctl start uppoint-tune.service                    # systemd aracılığıyla
#
# Not: Systemd MemoryMax=20% satırı yüzde sözdizimi kullandığından
#      bu script tarafından değiştirilmez — her boot'ta otomatik hesaplanır.

set -euo pipefail

# ── Donanım tespiti ──────────────────────────────────────────────────────────
TOTAL_RAM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
TOTAL_RAM_MB=$(( TOTAL_RAM_KB / 1024 ))
TOTAL_RAM_GB=$(awk "BEGIN { printf \"%.1f\", $TOTAL_RAM_MB / 1024 }")
CPU_COUNT=$(nproc)

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
printf "║  uppoint tune-system — %-34s║\n" "$(date '+%Y-%m-%d %H:%M:%S')"
printf "║  RAM: %-8s GB   CPU: %-4s çekirdek%20s║\n" "$TOTAL_RAM_GB" "$CPU_COUNT" ""
echo "╚══════════════════════════════════════════════════════════╝"

# ── 1. PostgreSQL ─────────────────────────────────────────────────────────────
PG_VERSION=17
PG_CONF_D="/etc/postgresql/${PG_VERSION}/main/conf.d"
PG_TUNED="${PG_CONF_D}/99-uppoint-tuned.conf"
PG_UNIT="postgresql@${PG_VERSION}-main"

# shared_buffers: RAM'in %25'i, max 8 GB
SB=$(( TOTAL_RAM_MB / 4 ))
(( SB > 8192 )) && SB=8192

# effective_cache_size: RAM'in %75'i
EC=$(( TOTAL_RAM_MB * 3 / 4 ))

# work_mem: RAM / (max_connections × 4), [4 MB – 256 MB]
# 100 bağlantı, her birinde 4 sıralama katmanı → /400
WM=$(( TOTAL_RAM_MB / 400 ))
(( WM < 4   )) && WM=4
(( WM > 256 )) && WM=256

# maintenance_work_mem: RAM'in %6.25'i, max 2 GB
MMW=$(( TOTAL_RAM_MB / 16 ))
(( MMW > 2048 )) && MMW=2048

# wal_buffers: shared_buffers'ın %3'ü, [1 MB – 64 MB]
WB=$(( SB * 3 / 100 ))
(( WB < 1  )) && WB=1
(( WB > 64 )) && WB=64

# checkpoint_completion_target: agresif olmayan checkpoint doldurma
# (sabit değer, bağımsız)
CCT="0.9"

mkdir -p "$PG_CONF_D"

cat > "$PG_TUNED" <<PGEOF
# Otomatik oluşturuldu — tune-system.sh — $(date '+%Y-%m-%d %H:%M:%S')
# RAM: ${TOTAL_RAM_GB} GB  |  CPU: ${CPU_COUNT} çekirdek
# Değiştirmek için: sudo bash /opt/uppoint-cloud/scripts/tune-system.sh
# Bu dosyayı doğrudan düzenlemeyin; bir sonraki çalıştırmada üzerine yazılır.

shared_buffers                 = '${SB}MB'
effective_cache_size           = '${EC}MB'
work_mem                       = '${WM}MB'
maintenance_work_mem           = '${MMW}MB'
wal_buffers                    = '${WB}MB'
checkpoint_completion_target   = ${CCT}
PGEOF

echo ""
echo "── PostgreSQL ──────────────────────────────────────────────"
echo "  shared_buffers              = ${SB} MB"
echo "  effective_cache_size        = ${EC} MB"
echo "  work_mem                    = ${WM} MB"
echo "  maintenance_work_mem        = ${MMW} MB"
echo "  wal_buffers                 = ${WB} MB"
echo "  checkpoint_completion_target= ${CCT}"
echo "  → ${PG_TUNED}"

if systemctl is-active --quiet "$PG_UNIT" 2>/dev/null; then
  systemctl restart "$PG_UNIT"
  echo "  ✓ PostgreSQL yeniden başlatıldı"
else
  echo "  · PostgreSQL çalışmıyor — ayarlar bir sonraki başlatmada geçerli olur"
fi

# ── 2. Node.js heap boyutu ──────────────────────────────────────────────────
TUNED_ENV="/etc/uppoint-cloud-tuned.env"

# Systemd MemoryMax=20% olduğundan:
#   MemoryMax ≈ RAM × 20%  (1 GB – 8 GB arası sınır)
# Node.js heap = MemoryMax × 75%
MEMMAX_MB=$(( TOTAL_RAM_MB / 5 ))
(( MEMMAX_MB < 1024 )) && MEMMAX_MB=1024
(( MEMMAX_MB > 8192 )) && MEMMAX_MB=8192
NODE_HEAP=$(( MEMMAX_MB * 75 / 100 ))

cat > "$TUNED_ENV" <<NEOF
# Otomatik oluşturuldu — tune-system.sh — $(date '+%Y-%m-%d %H:%M:%S')
# RAM: ${TOTAL_RAM_GB} GB | Systemd MemoryMax≈${MEMMAX_MB}MB | Node heap=${NODE_HEAP}MB
# Bu dosyayı doğrudan düzenlemeyin; tune-system.sh üzerine yazar.
NODE_OPTIONS=--max-old-space-size=${NODE_HEAP}
NEOF

chmod 640 "$TUNED_ENV"
chown root:www-data "$TUNED_ENV"

echo ""
echo "── Node.js ─────────────────────────────────────────────────"
echo "  Systemd MemoryMax (=20%)    ≈ ${MEMMAX_MB} MB"
echo "  --max-old-space-size        = ${NODE_HEAP} MB"
echo "  → ${TUNED_ENV}"

# ── 3. Kernel ağ parametreleri ──────────────────────────────────────────────
SYSCTL_CONF="/etc/sysctl.d/99-uppoint-tuned.conf"

cat > "$SYSCTL_CONF" <<SEOF
# Otomatik oluşturuldu — tune-system.sh — $(date '+%Y-%m-%d %H:%M:%S')
# Web sunucusu için ağ yığını optimizasyonları

# Gelen bağlantı kuyruğu — yüksek trafikte bağlantı reddi önler
net.core.somaxconn           = 1024
net.core.netdev_max_backlog  = 5000

# SYN flood koruması (genellikle varsayılan açık, garanti altına alınır)
net.ipv4.tcp_syncookies      = 1

# Ephemeral port aralığı genişletme (bant dışı bağlantı tükenmesi önler)
net.ipv4.ip_local_port_range = 1024 65535

# Kapalı bağlantılar için FIN_WAIT2 süresi (varsayılan 60s → 30s)
net.ipv4.tcp_fin_timeout     = 30

# Açık dosya tanımlayıcı üst sınırı
fs.file-max                  = 1000000
SEOF

sysctl -p "$SYSCTL_CONF" > /dev/null

echo ""
echo "── Kernel (sysctl) ─────────────────────────────────────────"
echo "  net.core.somaxconn           = 1024"
echo "  net.core.netdev_max_backlog  = 5000"
echo "  net.ipv4.tcp_syncookies      = 1"
echo "  net.ipv4.ip_local_port_range = 1024 65535"
echo "  net.ipv4.tcp_fin_timeout     = 30"
echo "  fs.file-max                  = 1000000"
echo "  → ${SYSCTL_CONF}"

# ── 4. Nginx worker_connections ──────────────────────────────────────────────
NGINX_TUNED="/etc/nginx/conf.d/99-uppoint-tuned.conf"

# worker_connections: CPU × 1024, max 65535
WC=$(( CPU_COUNT * 1024 ))
(( WC > 65535 )) && WC=65535

# Nginx conf.d yalnızca http{} içeriğini destekler; events{} buraya yazılamaz.
# worker_connections nginx.conf events{} bloğundadır — doğrudan güncelliyoruz.
NGINX_CONF="/etc/nginx/nginx.conf"
if grep -q "worker_connections" "$NGINX_CONF"; then
  sed -i "s/worker_connections[[:space:]]*[0-9]*/worker_connections ${WC}/" "$NGINX_CONF"
  nginx -t > /dev/null 2>&1 && systemctl reload nginx
  echo ""
  echo "── Nginx ───────────────────────────────────────────────────"
  echo "  worker_processes (mevcut)   = auto  (${CPU_COUNT} çekirdek)"
  echo "  worker_connections          = ${WC}"
  echo "  → ${NGINX_CONF}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Tamamlandı!                                             ║"
echo "║  uppoint-cloud servisini yeniden başlatmak için:        ║"
echo "║    systemctl restart uppoint-cloud.service              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
