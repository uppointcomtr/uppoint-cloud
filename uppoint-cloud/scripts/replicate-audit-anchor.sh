#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/opt/uppoint-cloud/scripts/lib/env-reader.sh
source "${SCRIPT_DIR}/lib/env-reader.sh"

ENV_FILE="/opt/uppoint-cloud/.env"
STATE_DIR="/var/lib/uppoint-cloud"
STATE_FILE="${STATE_DIR}/audit-anchor-replication.state"

AUDIT_ANCHOR_OUTPUT_PATH="${AUDIT_ANCHOR_OUTPUT_PATH:-}"
WORM_S3_BUCKET="${WORM_S3_BUCKET:-}"
WORM_S3_REGION="${WORM_S3_REGION:-}"
WORM_S3_PREFIX="${WORM_S3_PREFIX:-}"
WORM_S3_ENDPOINT_URL="${WORM_S3_ENDPOINT_URL:-}"
WORM_AUDIT_OBJECT_LOCK_MODE="${WORM_AUDIT_OBJECT_LOCK_MODE:-}"
WORM_AUDIT_RETENTION_DAYS="${WORM_AUDIT_RETENTION_DAYS:-}"
WORM_AUDIT_STORAGE_CLASS="${WORM_AUDIT_STORAGE_CLASS:-}"

if [ -z "$AUDIT_ANCHOR_OUTPUT_PATH" ]; then
  AUDIT_ANCHOR_OUTPUT_PATH="$(read_env_value "$ENV_FILE" "AUDIT_ANCHOR_OUTPUT_PATH")"
fi
if [ -z "$WORM_S3_BUCKET" ]; then
  WORM_S3_BUCKET="$(read_env_value "$ENV_FILE" "WORM_S3_BUCKET")"
fi
if [ -z "$WORM_S3_REGION" ]; then
  WORM_S3_REGION="$(read_env_value "$ENV_FILE" "WORM_S3_REGION")"
fi
if [ -z "$WORM_S3_PREFIX" ]; then
  WORM_S3_PREFIX="$(read_env_value "$ENV_FILE" "WORM_S3_PREFIX")"
fi
if [ -z "$WORM_S3_ENDPOINT_URL" ]; then
  WORM_S3_ENDPOINT_URL="$(read_env_value "$ENV_FILE" "WORM_S3_ENDPOINT_URL")"
fi
if [ -z "$WORM_AUDIT_OBJECT_LOCK_MODE" ]; then
  WORM_AUDIT_OBJECT_LOCK_MODE="$(read_env_value "$ENV_FILE" "WORM_AUDIT_OBJECT_LOCK_MODE")"
fi
if [ -z "$WORM_AUDIT_RETENTION_DAYS" ]; then
  WORM_AUDIT_RETENTION_DAYS="$(read_env_value "$ENV_FILE" "WORM_AUDIT_RETENTION_DAYS")"
fi
if [ -z "$WORM_AUDIT_STORAGE_CLASS" ]; then
  WORM_AUDIT_STORAGE_CLASS="$(read_env_value "$ENV_FILE" "WORM_AUDIT_STORAGE_CLASS")"
fi

AUDIT_ANCHOR_OUTPUT_PATH="${AUDIT_ANCHOR_OUTPUT_PATH:-/opt/backups/audit/audit-anchor.jsonl}"
WORM_S3_PREFIX="${WORM_S3_PREFIX:-uppoint-cloud/audit-anchor}"
WORM_AUDIT_OBJECT_LOCK_MODE="${WORM_AUDIT_OBJECT_LOCK_MODE:-COMPLIANCE}"
WORM_AUDIT_RETENTION_DAYS="${WORM_AUDIT_RETENTION_DAYS:-365}"
WORM_AUDIT_STORAGE_CLASS="${WORM_AUDIT_STORAGE_CLASS:-STANDARD_IA}"

if ! [[ "$WORM_AUDIT_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$WORM_AUDIT_RETENTION_DAYS" -lt 1 ]; then
  echo "[audit-anchor-replication] invalid WORM_AUDIT_RETENTION_DAYS: ${WORM_AUDIT_RETENTION_DAYS}" >&2
  exit 1
fi

if [ "$WORM_AUDIT_OBJECT_LOCK_MODE" != "COMPLIANCE" ] && [ "$WORM_AUDIT_OBJECT_LOCK_MODE" != "GOVERNANCE" ]; then
  echo "[audit-anchor-replication] invalid WORM_AUDIT_OBJECT_LOCK_MODE: ${WORM_AUDIT_OBJECT_LOCK_MODE}" >&2
  exit 1
fi

if [ -z "$WORM_S3_BUCKET" ] || [ -z "$WORM_S3_REGION" ]; then
  echo "[audit-anchor-replication] WORM_S3_BUCKET and WORM_S3_REGION are required." >&2
  exit 1
fi

if [ ! -f "$AUDIT_ANCHOR_OUTPUT_PATH" ]; then
  echo "[audit-anchor-replication] anchor file not found: ${AUDIT_ANCHOR_OUTPUT_PATH}" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "[audit-anchor-replication] aws cli is required for off-host WORM replication." >&2
  exit 1
fi

latest_line="$(tail -n 1 "$AUDIT_ANCHOR_OUTPUT_PATH" | tr -d '\r')"
if [ -z "$latest_line" ]; then
  echo "[audit-anchor-replication] anchor file is empty: ${AUDIT_ANCHOR_OUTPUT_PATH}" >&2
  exit 1
fi

line_hash="$(printf '%s' "$latest_line" | sha256sum | awk '{print $1}')"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

previous_hash=""
if [ -f "$STATE_FILE" ]; then
  previous_hash="$(awk '{print $1}' "$STATE_FILE" 2>/dev/null || true)"
fi

if [ -n "$previous_hash" ] && [ "$previous_hash" = "$line_hash" ]; then
  echo "[audit-anchor-replication] no new anchor record (hash=${line_hash})"
  exit 0
fi

key_suffix="$(node -e '
const line = process.argv[1] || "";
let anchoredAt = new Date();
try {
  const parsed = JSON.parse(line);
  if (parsed && typeof parsed.anchoredAt === "string") {
    const candidate = new Date(parsed.anchoredAt);
    if (!Number.isNaN(candidate.getTime())) {
      anchoredAt = candidate;
    }
  }
} catch {}
const pad = (value) => String(value).padStart(2, "0");
const yyyy = anchoredAt.getUTCFullYear();
const mm = pad(anchoredAt.getUTCMonth() + 1);
const dd = pad(anchoredAt.getUTCDate());
const HH = pad(anchoredAt.getUTCHours());
const MM = pad(anchoredAt.getUTCMinutes());
const SS = pad(anchoredAt.getUTCSeconds());
process.stdout.write(`${yyyy}/${mm}/${dd}/anchor_${yyyy}${mm}${dd}T${HH}${MM}${SS}Z`);
' "$latest_line")"
object_key="${WORM_S3_PREFIX%/}/${key_suffix}_${line_hash}.json"
retain_until="$(date -u -d "+${WORM_AUDIT_RETENTION_DAYS} days" +"%Y-%m-%dT%H:%M:%SZ")"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT
printf '%s\n' "$latest_line" > "$tmp_file"

put_object_cmd=(
  aws s3api put-object
  --bucket "$WORM_S3_BUCKET"
  --key "$object_key"
  --body "$tmp_file"
  --region "$WORM_S3_REGION"
  --content-type "application/json"
  --storage-class "$WORM_AUDIT_STORAGE_CLASS"
  --object-lock-mode "$WORM_AUDIT_OBJECT_LOCK_MODE"
  --object-lock-retain-until-date "$retain_until"
)

if [ -n "$WORM_S3_ENDPOINT_URL" ]; then
  put_object_cmd+=(--endpoint-url "$WORM_S3_ENDPOINT_URL")
fi

"${put_object_cmd[@]}" >/dev/null

head_object_cmd=(
  aws s3api head-object
  --bucket "$WORM_S3_BUCKET"
  --key "$object_key"
  --region "$WORM_S3_REGION"
  --query "{ObjectLockMode:ObjectLockMode,ObjectLockRetainUntilDate:ObjectLockRetainUntilDate,VersionId:VersionId}"
  --output json
)
if [ -n "$WORM_S3_ENDPOINT_URL" ]; then
  head_object_cmd+=(--endpoint-url "$WORM_S3_ENDPOINT_URL")
fi

head_output="$("${head_object_cmd[@]}")"
echo "${line_hash} ${object_key} $(date +%s)" > "$STATE_FILE"
chmod 600 "$STATE_FILE"

echo "[audit-anchor-replication] replicated anchor hash=${line_hash} key=${object_key}"
echo "[audit-anchor-replication] lock=${head_output}"
