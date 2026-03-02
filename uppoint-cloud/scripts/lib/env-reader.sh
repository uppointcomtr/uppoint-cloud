#!/usr/bin/env bash
set -euo pipefail

read_env_value() {
  local env_file="$1"
  local key="$2"

  if [ ! -f "$env_file" ]; then
    printf '%s' ""
    return 0
  fi

  local line
  line="$(
    grep -E "^${key}=" "$env_file" | tail -n1 || true
  )"

  if [ -z "$line" ]; then
    printf '%s' ""
    return 0
  fi

  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"

  printf '%s' "$value"
}
