#!/usr/bin/env bash
# Analyze Nginx auth traffic and tune auth rate-limit config safely.
# Default mode: report-only
# Apply mode:    --apply

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
LOG_FILE="/var/log/nginx/access.log"
ZONE_CONF="/etc/nginx/conf.d/uppoint-rate-limit.conf"
SITE_CONF="/etc/nginx/sites-available/cloud.uppoint.com.tr.conf"
REPORT_DIR="/var/log/uppoint-cloud/auth-rate-limit"
TAIL_LINES=20000
APPLY_CHANGES=0
MIN_SAMPLE=120
AUTH_PREFIX="/api/auth/"
ZONE_NAME="uppoint_auth_per_ip"

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options]

Options:
  --apply                 Apply recommended rate/burst and reload Nginx.
  --log-file <path>       Nginx access log path (default: ${LOG_FILE}).
  --tail-lines <number>   How many latest lines to analyze (default: ${TAIL_LINES}).
  --report-dir <path>     Report output directory (default: ${REPORT_DIR}).
  --min-sample <number>   Minimum auth requests required for tuning (default: ${MIN_SAMPLE}).
  -h, --help              Show this help.

Notes:
  - Without --apply, script only generates reports and recommendations.
  - With --apply, script validates Nginx config and rolls back on failure.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY_CHANGES=1
      shift
      ;;
    --log-file)
      LOG_FILE="$2"
      shift 2
      ;;
    --tail-lines)
      TAIL_LINES="$2"
      shift 2
      ;;
    --report-dir)
      REPORT_DIR="$2"
      shift 2
      ;;
    --min-sample)
      MIN_SAMPLE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[${SCRIPT_NAME}] Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! [[ "$TAIL_LINES" =~ ^[0-9]+$ ]] || [ "$TAIL_LINES" -lt 1000 ]; then
  echo "[${SCRIPT_NAME}] Invalid --tail-lines value: ${TAIL_LINES}" >&2
  exit 1
fi

if ! [[ "$MIN_SAMPLE" =~ ^[0-9]+$ ]] || [ "$MIN_SAMPLE" -lt 50 ]; then
  echo "[${SCRIPT_NAME}] Invalid --min-sample value: ${MIN_SAMPLE}" >&2
  exit 1
fi

require_file() {
  local target="$1"
  if [ ! -f "$target" ]; then
    echo "[${SCRIPT_NAME}] Required file not found: $target" >&2
    exit 1
  fi
}

require_file "$LOG_FILE"
require_file "$ZONE_CONF"
require_file "$SITE_CONF"

mkdir -p "$REPORT_DIR"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

rows_file="${tmp_dir}/auth_rows.tsv"
ip_min_counts="${tmp_dir}/ip_min_counts.txt"

tail -n "$TAIL_LINES" "$LOG_FILE" | awk -v prefix="$AUTH_PREFIX" '
{
  ip = $1
  if (match($0, /\[([^]]+)\]/, ts) == 0) next
  split(ts[1], tparts, ":")
  if (length(tparts) < 3) next
  minute = tparts[1] ":" tparts[2] ":" tparts[3]

  split($0, q, "\"")
  if (length(q) < 3) next
  request = q[2]
  split(request, rparts, " ")
  if (length(rparts) < 2) next
  path = rparts[2]

  if (index(path, prefix) != 1) next

  rest = q[3]
  gsub(/^[ \t]+/, "", rest)
  split(rest, sp, " ")
  status = sp[1]
  if (status !~ /^[0-9]{3}$/) next

  print ip "\t" minute "\t" status "\t" path
}
' > "$rows_file"

total_auth_requests=$(wc -l < "$rows_file" | tr -d '[:space:]')
if [ "$total_auth_requests" -eq 0 ]; then
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  report_md="${REPORT_DIR}/auth-rate-limit-latest.md"
  report_json="${REPORT_DIR}/auth-rate-limit-latest.json"

  cat > "$report_md" <<EOF
# Auth Rate Limit Tuning Report

- generated_at_utc: ${ts}
- mode: report-only
- log_file: ${LOG_FILE}
- analyzed_tail_lines: ${TAIL_LINES}
- auth_requests_found: 0

No \`${AUTH_PREFIX}\` traffic found in analyzed log window. No tuning applied.
EOF

  cat > "$report_json" <<EOF
{"generated_at_utc":"${ts}","mode":"report-only","auth_requests_found":0,"log_file":"${LOG_FILE}","analyzed_tail_lines":${TAIL_LINES},"applied":false}
EOF

  echo "[${SCRIPT_NAME}] No auth traffic found. Report written to: ${report_md}"
  exit 0
fi

auth_429_requests=$(awk -F '\t' '$3 == 429 {count++} END {print count + 0}' "$rows_file")
unique_ips=$(cut -f1 "$rows_file" | sort -u | wc -l | tr -d '[:space:]')
unique_minutes=$(cut -f2 "$rows_file" | sort -u | wc -l | tr -d '[:space:]')

awk -F '\t' '{k = $1 "\t" $2; c[k]++} END {for (k in c) print c[k]}' "$rows_file" | sort -n > "$ip_min_counts"

samples=$(wc -l < "$ip_min_counts" | tr -d '[:space:]')
p95_index=$(( (samples * 95 + 99) / 100 ))
p95_per_ip_minute=$(sed -n "${p95_index}p" "$ip_min_counts")
max_per_ip_minute=$(tail -n1 "$ip_min_counts")
p95_per_ip_minute=${p95_per_ip_minute:-0}
max_per_ip_minute=${max_per_ip_minute:-0}

requests_per_minute=$(awk -v total="$total_auth_requests" -v minutes="$unique_minutes" 'BEGIN { if (minutes == 0) { print "0.00" } else { printf "%.2f", total / minutes } }')
rate_429_pct=$(awk -v total="$total_auth_requests" -v denied="$auth_429_requests" 'BEGIN { if (total == 0) { print "0.00" } else { printf "%.2f", (denied * 100) / total } }')

current_rate=$(sed -nE 's/.*rate=([0-9]+)r\/m.*/\1/p' "$ZONE_CONF" | head -n1)
current_burst=$(sed -nE "s/.*limit_req zone=${ZONE_NAME} burst=([0-9]+).*/\\1/p" "$SITE_CONF" | head -n1)
current_rate=${current_rate:-30}
current_burst=${current_burst:-20}

# Recommendation formula:
# - base rate from p95 with safety margin
# - scale up when denied ratio is high
# - scale down slowly when denied ratio is almost zero and p95 is very low
raw_rate=$(awk -v p95="$p95_per_ip_minute" 'BEGIN {
  base = int((p95 * 1.5) + 0.999999)
  if (base < 20) base = 20
  print base
}')

if awk -v pct="$rate_429_pct" 'BEGIN { exit !(pct >= 5.0) }'; then
  raw_rate=$(( raw_rate + 15 ))
elif awk -v pct="$rate_429_pct" -v p95="$p95_per_ip_minute" -v cur="$current_rate" 'BEGIN { exit !(pct <= 0.2 && p95 < (cur / 3)) }'; then
  raw_rate=$(( raw_rate - 5 ))
fi

if [ "$raw_rate" -lt 20 ]; then raw_rate=20; fi
if [ "$raw_rate" -gt 180 ]; then raw_rate=180; fi

# Step-limit to avoid oscillation per run.
if [ "$raw_rate" -gt $(( current_rate + 20 )) ]; then
  rec_rate=$(( current_rate + 20 ))
elif [ "$raw_rate" -lt $(( current_rate - 20 )) ]; then
  rec_rate=$(( current_rate - 20 ))
else
  rec_rate="$raw_rate"
fi

raw_burst=$(awk -v rate="$rec_rate" -v p95="$p95_per_ip_minute" 'BEGIN {
  b = int((rate * 0.67) + 0.999999)
  floor = p95 + 5
  if (b < floor) b = floor
  if (b < 10) b = 10
  if (b > 120) b = 120
  print b
}')

if [ "$raw_burst" -gt $(( current_burst + 15 )) ]; then
  rec_burst=$(( current_burst + 15 ))
elif [ "$raw_burst" -lt $(( current_burst - 15 )) ]; then
  rec_burst=$(( current_burst - 15 ))
else
  rec_burst="$raw_burst"
fi

if [ "$rec_burst" -lt 10 ]; then rec_burst=10; fi
if [ "$rec_burst" -gt 120 ]; then rec_burst=120; fi

recommendation_reason="stable"
if [ "$total_auth_requests" -lt "$MIN_SAMPLE" ]; then
  recommendation_reason="insufficient_sample"
elif awk -v pct="$rate_429_pct" 'BEGIN { exit !(pct >= 5.0) }'; then
  recommendation_reason="high_429_ratio"
elif awk -v pct="$rate_429_pct" -v p95="$p95_per_ip_minute" -v cur="$current_rate" 'BEGIN { exit !(pct <= 0.2 && p95 < (cur / 3)) }'; then
  recommendation_reason="overprovisioned_limit"
fi

top_ips_table=$(awk -F '\t' '
{
  total[$1]++
  if ($3 == 429) denied[$1]++
}
END {
  for (ip in total) {
    d = denied[ip] + 0
    printf "%s\t%d\t%d\n", ip, total[ip], d
  }
}
' "$rows_file" | sort -k2,2nr | head -n10)

top_paths_table=$(awk -F '\t' '
{
  total[$4]++
  if ($3 == 429) denied[$4]++
}
END {
  for (path in total) {
    d = denied[path] + 0
    printf "%s\t%d\t%d\n", path, total[path], d
  }
}
' "$rows_file" | sort -k2,2nr | head -n10)

ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
report_base="auth-rate-limit-$(date -u +%Y%m%dT%H%M%SZ)"
report_md="${REPORT_DIR}/${report_base}.md"
report_json="${REPORT_DIR}/${report_base}.json"
latest_md="${REPORT_DIR}/auth-rate-limit-latest.md"
latest_json="${REPORT_DIR}/auth-rate-limit-latest.json"

cat > "$report_md" <<EOF
# Auth Rate Limit Tuning Report

- generated_at_utc: ${ts}
- mode: $([ "$APPLY_CHANGES" -eq 1 ] && echo "apply" || echo "report-only")
- log_file: ${LOG_FILE}
- analyzed_tail_lines: ${TAIL_LINES}
- auth_prefix: ${AUTH_PREFIX}
- auth_requests: ${total_auth_requests}
- auth_429: ${auth_429_requests} (${rate_429_pct}%)
- unique_ips: ${unique_ips}
- unique_minutes: ${unique_minutes}
- avg_requests_per_minute: ${requests_per_minute}
- p95_per_ip_per_minute: ${p95_per_ip_minute}
- max_per_ip_per_minute: ${max_per_ip_minute}
- current_rate_rpm: ${current_rate}
- current_burst: ${current_burst}
- recommended_rate_rpm: ${rec_rate}
- recommended_burst: ${rec_burst}
- recommendation_reason: ${recommendation_reason}

## Top IPs (request_count, denied_429)

\`\`\`text
IP\tREQUESTS\tDENIED_429
${top_ips_table}
\`\`\`

## Top Auth Paths (request_count, denied_429)

\`\`\`text
PATH\tREQUESTS\tDENIED_429
${top_paths_table}
\`\`\`
EOF

cat > "$report_json" <<EOF
{"generated_at_utc":"${ts}","mode":"$([ "$APPLY_CHANGES" -eq 1 ] && echo "apply" || echo "report-only")","log_file":"${LOG_FILE}","analyzed_tail_lines":${TAIL_LINES},"auth_prefix":"${AUTH_PREFIX}","auth_requests":${total_auth_requests},"auth_429":${auth_429_requests},"auth_429_pct":${rate_429_pct},"unique_ips":${unique_ips},"unique_minutes":${unique_minutes},"avg_requests_per_minute":${requests_per_minute},"p95_per_ip_per_minute":${p95_per_ip_minute},"max_per_ip_per_minute":${max_per_ip_minute},"current_rate_rpm":${current_rate},"current_burst":${current_burst},"recommended_rate_rpm":${rec_rate},"recommended_burst":${rec_burst},"recommendation_reason":"${recommendation_reason}","applied":false}
EOF

cp "$report_md" "$latest_md"
cp "$report_json" "$latest_json"

echo "[${SCRIPT_NAME}] Report generated:"
echo "  - ${report_md}"
echo "  - ${report_json}"
echo "  - ${latest_md}"
echo "  - ${latest_json}"

if [ "$APPLY_CHANGES" -ne 1 ]; then
  exit 0
fi

if [ "$total_auth_requests" -lt "$MIN_SAMPLE" ]; then
  echo "[${SCRIPT_NAME}] Skipping apply: auth_requests=${total_auth_requests} < min_sample=${MIN_SAMPLE}"
  exit 0
fi

if [ "$rec_rate" -eq "$current_rate" ] && [ "$rec_burst" -eq "$current_burst" ]; then
  echo "[${SCRIPT_NAME}] No config change required."
  exit 0
fi

zone_backup="${ZONE_CONF}.bak.$(date +%s)"
site_backup="${SITE_CONF}.bak.$(date +%s)"
cp "$ZONE_CONF" "$zone_backup"
cp "$SITE_CONF" "$site_backup"

sed -E -i "s/(rate=)[0-9]+(r\/m;)/\\1${rec_rate}\\2/" "$ZONE_CONF"
sed -E -i "s/(limit_req zone=${ZONE_NAME} burst=)[0-9]+/\\1${rec_burst}/" "$SITE_CONF"

if ! nginx -t >/dev/null 2>&1; then
  cp "$zone_backup" "$ZONE_CONF"
  cp "$site_backup" "$SITE_CONF"
  echo "[${SCRIPT_NAME}] Nginx config test failed after update; rollback completed." >&2
  exit 1
fi

systemctl reload nginx

cat > "$report_json" <<EOF
{"generated_at_utc":"${ts}","mode":"apply","log_file":"${LOG_FILE}","analyzed_tail_lines":${TAIL_LINES},"auth_prefix":"${AUTH_PREFIX}","auth_requests":${total_auth_requests},"auth_429":${auth_429_requests},"auth_429_pct":${rate_429_pct},"unique_ips":${unique_ips},"unique_minutes":${unique_minutes},"avg_requests_per_minute":${requests_per_minute},"p95_per_ip_per_minute":${p95_per_ip_minute},"max_per_ip_per_minute":${max_per_ip_minute},"current_rate_rpm":${current_rate},"current_burst":${current_burst},"recommended_rate_rpm":${rec_rate},"recommended_burst":${rec_burst},"recommendation_reason":"${recommendation_reason}","applied":true}
EOF
cp "$report_json" "$latest_json"

echo "[${SCRIPT_NAME}] Applied and reloaded:"
echo "  - rate: ${current_rate}r/m -> ${rec_rate}r/m"
echo "  - burst: ${current_burst} -> ${rec_burst}"
echo "  - backups: ${zone_backup}, ${site_backup}"
