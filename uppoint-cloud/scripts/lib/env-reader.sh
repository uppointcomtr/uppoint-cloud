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

parse_postgres_env_lines() {
  local database_url="$1"

  DATABASE_URL_INPUT="$database_url" node - <<'NODE'
const raw = process.env.DATABASE_URL_INPUT || "";
if (!raw) {
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  process.exit(2);
}

if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  process.exit(3);
}

const mapping = {
  PGHOST: decodeURIComponent(parsed.hostname || ""),
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username || ""),
  PGPASSWORD: decodeURIComponent(parsed.password || ""),
  PGDATABASE: decodeURIComponent((parsed.pathname || "").replace(/^\//, "")),
  PGSSLMODE: parsed.searchParams.get("sslmode") || "",
  PGSSLROOTCERT: parsed.searchParams.get("sslrootcert") || "",
  PGSSLCERT: parsed.searchParams.get("sslcert") || "",
  PGSSLKEY: parsed.searchParams.get("sslkey") || "",
  PGTARGETSESSIONATTRS: parsed.searchParams.get("target_session_attrs") || "",
};

for (const [key, value] of Object.entries(mapping)) {
  if (!value) continue;
  process.stdout.write(`${key}\t${value}\n`);
}
NODE
}

configure_postgres_connection() {
  local database_url="$1"
  local key
  local value

  while IFS=$'\t' read -r key value; do
    case "$key" in
      PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PGSSLMODE|PGSSLROOTCERT|PGSSLCERT|PGSSLKEY|PGTARGETSESSIONATTRS)
        export "${key}=${value}"
        ;;
    esac
  done < <(parse_postgres_env_lines "$database_url")
}
