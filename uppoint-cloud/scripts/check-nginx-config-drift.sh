#!/usr/bin/env bash
set -euo pipefail

HAS_DRIFT=0

target_site_file="/etc/nginx/sites-available/cloud.uppoint.com.tr.conf"
target_rate_limit_file="/etc/nginx/conf.d/uppoint-rate-limit.conf"

template_tls="/opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.conf"
template_bootstrap="/opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.bootstrap.conf"
template_rate_limit="/opt/uppoint-cloud/ops/nginx/uppoint-rate-limit.conf"

hash_of() {
  local file_path="$1"
  sha256sum "$file_path" | awk '{print $1}'
}

hash_of_normalized_site() {
  local file_path="$1"
  sed -E 's/(limit_req zone=uppoint_auth_per_ip burst=)[0-9]+( nodelay;)/\1<burst>\2/' "$file_path" \
    | sha256sum \
    | awk '{print $1}'
}

check_site_file() {
  if [ ! -f "$target_site_file" ]; then
    echo "[drift] missing target file: $target_site_file" >&2
    HAS_DRIFT=1
    return
  fi

  if [ ! -f "$template_tls" ] || [ ! -f "$template_bootstrap" ]; then
    echo "[drift] missing site template(s): $template_tls or $template_bootstrap" >&2
    HAS_DRIFT=1
    return
  fi

  local target_hash tls_hash bootstrap_hash
  target_hash="$(hash_of "$target_site_file")"
  tls_hash="$(hash_of "$template_tls")"
  bootstrap_hash="$(hash_of "$template_bootstrap")"

  if [ "$target_hash" = "$tls_hash" ]; then
    echo "[drift] ok: $target_site_file matches TLS template"
    return
  fi

  if [ "$target_hash" = "$bootstrap_hash" ]; then
    echo "[drift] ok: $target_site_file matches bootstrap template"
    return
  fi

  local target_normalized_hash tls_normalized_hash bootstrap_normalized_hash
  target_normalized_hash="$(hash_of_normalized_site "$target_site_file")"
  tls_normalized_hash="$(hash_of_normalized_site "$template_tls")"
  bootstrap_normalized_hash="$(hash_of_normalized_site "$template_bootstrap")"

  if [ "$target_normalized_hash" = "$tls_normalized_hash" ]; then
    echo "[drift] warn: $target_site_file differs from TLS template only by auth burst (expected after tuning)"
    return
  fi

  if [ "$target_normalized_hash" = "$bootstrap_normalized_hash" ]; then
    echo "[drift] warn: $target_site_file differs from bootstrap template only by auth burst (expected after tuning)"
    return
  fi

  echo "[drift] mismatch: $target_site_file differs from both repo templates"
  HAS_DRIFT=1
}

check_site_security_directives() {
  if [ ! -f "$target_site_file" ]; then
    return
  fi

  if grep -Eq "style-src[^;]*'unsafe-inline'" "$target_site_file"; then
    echo "[drift] insecure CSP detected in $target_site_file: style-src contains 'unsafe-inline'" >&2
    HAS_DRIFT=1
  fi
}

check_rate_limit_file() {
  if [ ! -f "$target_rate_limit_file" ]; then
    echo "[drift] missing target file: $target_rate_limit_file" >&2
    HAS_DRIFT=1
    return
  fi

  if [ ! -f "$template_rate_limit" ]; then
    echo "[drift] missing source file: $template_rate_limit" >&2
    HAS_DRIFT=1
    return
  fi

  local target_hash source_hash
  target_hash="$(hash_of "$target_rate_limit_file")"
  source_hash="$(hash_of "$template_rate_limit")"

  if [ "$target_hash" = "$source_hash" ]; then
    echo "[drift] ok: $target_rate_limit_file"
    return
  fi

  if [ "${STRICT_RATE_LIMIT_TEMPLATE:-0}" = "1" ]; then
    echo "[drift] mismatch: $target_rate_limit_file differs from repo template $template_rate_limit"
    HAS_DRIFT=1
    return
  fi

  echo "[drift] warn: $target_rate_limit_file differs from template (expected after rate-limit tuning); set STRICT_RATE_LIMIT_TEMPLATE=1 to fail"
}

check_site_file
check_site_security_directives
check_rate_limit_file

if [ "$HAS_DRIFT" -ne 0 ]; then
  echo "[drift] nginx configuration drift detected." >&2
  exit 1
fi

echo "[drift] no nginx configuration drift detected."
