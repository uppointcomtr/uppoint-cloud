#!/usr/bin/env bash
# /opt/uppoint-cloud/scripts/tune-system.sh
#
# Sunucunun donanım bilgisine göre tüm katmanları otomatik olarak ayarlar:
#   • PostgreSQL bellek + bağlantı parametreleri
#   • Node.js heap boyutu (systemd EnvironmentFile)
#   • Kernel ağ + I/O + VM parametreleri
#   • Nginx worker_connections
#
# Çalıştırma:
#   sudo bash /opt/uppoint-cloud/scripts/tune-system.sh    # manuel (donanım yükseltme sonrası)
#   systemctl start uppoint-tune.service                    # systemd aracılığıyla
#
# Not: Systemd MemoryMax=20% yüzde sözdizimi kullanır, bu script tarafından değiştirilmez.

set -euo pipefail

# ── Donanım tespiti ──────────────────────────────────────────────────────────
TOTAL_RAM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
TOTAL_RAM_MB=$(( TOTAL_RAM_KB / 1024 ))
TOTAL_RAM_GB=$(awk "BEGIN { printf \"%.1f\", $TOTAL_RAM_MB / 1024 }")
CPU_COUNT=$(nproc)

# Disk tipi: ROTA=0 → SSD, ROTA=1 → HDD
DISK_ROTA=$(lsblk -d -o ROTA 2>/dev/null | grep -v ROTA | head -1 | tr -d ' ')
if [ "${DISK_ROTA:-1}" = "0" ]; then
  DISK_TYPE="SSD"
  RANDOM_PAGE_COST="1.1"
  EFFECTIVE_IO_CONCURRENCY="200"
else
  DISK_TYPE="HDD"
  RANDOM_PAGE_COST="4.0"
  EFFECTIVE_IO_CONCURRENCY="4"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
printf "║  uppoint tune-system — %-34s║\n" "$(date '+%Y-%m-%d %H:%M:%S')"
printf "║  RAM: %-8s GB   CPU: %-4s çekirdek   Disk: %-5s  ║\n" "$TOTAL_RAM_GB" "$CPU_COUNT" "$DISK_TYPE"
echo "╚══════════════════════════════════════════════════════════╝"

# ── 1. PostgreSQL ─────────────────────────────────────────────────────────────
PG_VERSION=17
PG_CONF_D="/etc/postgresql/${PG_VERSION}/main/conf.d"
PG_TUNED="${PG_CONF_D}/99-uppoint-tuned.conf"
PG_UNIT="postgresql@${PG_VERSION}-main"

# max_connections: RAM/100, [100, 300]
MAX_CONN=$(( TOTAL_RAM_MB / 100 ))
(( MAX_CONN < 100 )) && MAX_CONN=100
(( MAX_CONN > 300 )) && MAX_CONN=300

# shared_buffers: RAM'in %25'i, max 8 GB
SB=$(( TOTAL_RAM_MB / 4 ))
(( SB > 8192 )) && SB=8192

# effective_cache_size: RAM'in %75'i
EC=$(( TOTAL_RAM_MB * 3 / 4 ))

# work_mem: RAM / (max_connections × 2), [4 MB – 256 MB]
# Tüm bağlantılar aynı anda sort yapmaz; ortalama aktif bağlantı × 2 ← güvenli çarpan
WM=$(( TOTAL_RAM_MB / ( MAX_CONN * 2 ) ))
(( WM < 4   )) && WM=4
(( WM > 256 )) && WM=256

# maintenance_work_mem: RAM'in %6.25'i, max 2 GB
MMW=$(( TOTAL_RAM_MB / 16 ))
(( MMW > 2048 )) && MMW=2048

# wal_buffers: shared_buffers'ın %3'ü, [1 MB – 64 MB]
WB=$(( SB * 3 / 100 ))
(( WB < 1  )) && WB=1
(( WB > 64 )) && WB=64

# autovacuum: daha sık çalışır, table bloat + txid wraparound önler
AV_NAPTIME="20s"
AV_VACUUM_THRESHOLD="50"
AV_ANALYZE_THRESHOLD="50"
AV_VACUUM_SCALE="0.05"
AV_ANALYZE_SCALE="0.02"

mkdir -p "$PG_CONF_D"

cat > "$PG_TUNED" <<PGEOF
# Otomatik oluşturuldu — tune-system.sh — $(date '+%Y-%m-%d %H:%M:%S')
# RAM: ${TOTAL_RAM_GB} GB  |  CPU: ${CPU_COUNT} çekirdek  |  Disk: ${DISK_TYPE}
# Değiştirmek için: sudo bash /opt/uppoint-cloud/scripts/tune-system.sh
# Bu dosyayı doğrudan düzenlemeyin; bir sonraki çalıştırmada üzerine yazılır.

# Bağlantı
max_connections              = ${MAX_CONN}

# Bellek
shared_buffers               = '${SB}MB'
effective_cache_size         = '${EC}MB'
work_mem                     = '${WM}MB'
maintenance_work_mem         = '${MMW}MB'
wal_buffers                  = '${WB}MB'

# Checkpoint
checkpoint_completion_target = 0.9

# Disk tipi: ${DISK_TYPE}
random_page_cost             = ${RANDOM_PAGE_COST}
effective_io_concurrency     = ${EFFECTIVE_IO_CONCURRENCY}

# Autovacuum (table bloat + txid wraparound koruması)
autovacuum_naptime           = ${AV_NAPTIME}
autovacuum_vacuum_threshold  = ${AV_VACUUM_THRESHOLD}
autovacuum_analyze_threshold = ${AV_ANALYZE_THRESHOLD}
autovacuum_vacuum_scale_factor   = ${AV_VACUUM_SCALE}
autovacuum_analyze_scale_factor  = ${AV_ANALYZE_SCALE}
PGEOF

echo ""
echo "── PostgreSQL ──────────────────────────────────────────────"
echo "  max_connections             = ${MAX_CONN}"
echo "  shared_buffers              = ${SB} MB"
echo "  effective_cache_size        = ${EC} MB"
echo "  work_mem                    = ${WM} MB"
echo "  maintenance_work_mem        = ${MMW} MB"
echo "  wal_buffers                 = ${WB} MB"
echo "  random_page_cost            = ${RANDOM_PAGE_COST} (${DISK_TYPE})"
echo "  effective_io_concurrency    = ${EFFECTIVE_IO_CONCURRENCY}"
echo "  autovacuum_naptime          = ${AV_NAPTIME}"
echo "  → ${PG_TUNED}"

if systemctl is-active --quiet "$PG_UNIT" 2>/dev/null; then
  systemctl restart "$PG_UNIT"
  echo "  ✓ PostgreSQL yeniden başlatıldı"
else
  echo "  · PostgreSQL çalışmıyor — ayarlar bir sonraki başlatmada geçerli olur"
fi

# ── 2. Node.js heap boyutu ──────────────────────────────────────────────────
TUNED_ENV="/etc/uppoint-cloud-tuned.env"

# Systemd MemoryMax=20% olduğundan: MemoryMax ≈ RAM × 20%, [1 GB – 8 GB]
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

# ── 3. Kernel parametreleri ──────────────────────────────────────────────────
SYSCTL_CONF="/etc/sysctl.d/99-uppoint-tuned.conf"

cat > "$SYSCTL_CONF" <<SEOF
# Otomatik oluşturuldu — tune-system.sh — $(date '+%Y-%m-%d %H:%M:%S')
# RAM: ${TOTAL_RAM_GB} GB  |  CPU: ${CPU_COUNT} çekirdek  |  Disk: ${DISK_TYPE}

# ── Bellek yönetimi ──
# Web sunucusu RAM yoğun — swap yalnızca son çare olsun (varsayılan: 60)
vm.swappiness                = 10
# Dirty page flush eşikleri — I/O patlamalarını önler
vm.dirty_ratio               = 15
vm.dirty_background_ratio    = 5

# ── Ağ yığını ────────
# Gelen bağlantı kuyruğu — yüksek trafikte bağlantı reddi önler
net.core.somaxconn           = 1024
net.core.netdev_max_backlog  = 5000
# SYN flood koruması
net.ipv4.tcp_syncookies      = 1
# Ephemeral port aralığı genişletme
net.ipv4.ip_local_port_range = 1024 65535
# FIN_WAIT2 süresi kısalt (varsayılan 60s)
net.ipv4.tcp_fin_timeout     = 30
# TIME_WAIT soket yeniden kullanımı
net.ipv4.tcp_tw_reuse        = 1

# ── Dosya sistemi ────
fs.file-max                  = 1000000
SEOF

sysctl -p "$SYSCTL_CONF" > /dev/null

echo ""
echo "── Kernel (sysctl) ─────────────────────────────────────────"
echo "  vm.swappiness                = 10   (varsayılan: 60)"
echo "  vm.dirty_ratio               = 15"
echo "  vm.dirty_background_ratio    = 5"
echo "  net.core.somaxconn           = 1024"
echo "  net.core.netdev_max_backlog  = 5000"
echo "  net.ipv4.tcp_fin_timeout     = 30"
echo "  net.ipv4.tcp_tw_reuse        = 1"
echo "  fs.file-max                  = 1000000"
echo "  → ${SYSCTL_CONF}"

# ── 4. Nginx worker_connections ──────────────────────────────────────────────
# worker_connections: CPU × 1024, max 65535
WC=$(( CPU_COUNT * 1024 ))
(( WC > 65535 )) && WC=65535

NGINX_CONF="/etc/nginx/nginx.conf"
if grep -q "worker_connections" "$NGINX_CONF"; then
  sed -i "s/worker_connections[[:space:]]*[0-9]*/worker_connections ${WC}/" "$NGINX_CONF"
  nginx -t > /dev/null 2>&1 && systemctl reload nginx
  echo ""
  echo "── Nginx ───────────────────────────────────────────────────"
  echo "  worker_processes            = auto  (${CPU_COUNT} çekirdek)"
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
