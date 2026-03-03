#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/uppoint-cloud"
HOST="127.0.0.1"
PORT="${E2E_PORT:-3101}"
BASE_URL="http://${HOST}:${PORT}"
STARTUP_TIMEOUT_SECONDS="${E2E_STARTUP_TIMEOUT_SECONDS:-45}"

cd "$ROOT_DIR"

CURRENT_ALLOWED_HOSTS="$(
  grep -E '^UPPOINT_ALLOWED_HOSTS=' "$ROOT_DIR/.env" 2>/dev/null | tail -n1 | cut -d '=' -f2- || true
)"
CURRENT_ALLOWED_HOSTS="${CURRENT_ALLOWED_HOSTS%\"}"
CURRENT_ALLOWED_HOSTS="${CURRENT_ALLOWED_HOSTS#\"}"
CURRENT_ALLOWED_HOSTS="${CURRENT_ALLOWED_HOSTS%\'}"
CURRENT_ALLOWED_HOSTS="${CURRENT_ALLOWED_HOSTS#\'}"
LOCAL_ALLOWED_HOSTS="127.0.0.1:${PORT},localhost:${PORT}"
CURRENT_ALLOWED_ORIGINS="$(
  grep -E '^UPPOINT_ALLOWED_ORIGINS=' "$ROOT_DIR/.env" 2>/dev/null | tail -n1 | cut -d '=' -f2- || true
)"
CURRENT_ALLOWED_ORIGINS="${CURRENT_ALLOWED_ORIGINS%\"}"
CURRENT_ALLOWED_ORIGINS="${CURRENT_ALLOWED_ORIGINS#\"}"
CURRENT_ALLOWED_ORIGINS="${CURRENT_ALLOWED_ORIGINS%\'}"
CURRENT_ALLOWED_ORIGINS="${CURRENT_ALLOWED_ORIGINS#\'}"
LOCAL_ALLOWED_ORIGINS="http://127.0.0.1:${PORT},http://localhost:${PORT}"
APP_URL_FROM_ENV="$(
  grep -E '^NEXT_PUBLIC_APP_URL=' "$ROOT_DIR/.env" 2>/dev/null | tail -n1 | cut -d '=' -f2- || true
)"
APP_URL_FROM_ENV="${APP_URL_FROM_ENV%\"}"
APP_URL_FROM_ENV="${APP_URL_FROM_ENV#\"}"
APP_URL_FROM_ENV="${APP_URL_FROM_ENV%\'}"
APP_URL_FROM_ENV="${APP_URL_FROM_ENV#\'}"
CANONICAL_HOST=""
CANONICAL_ORIGIN=""
if [ -n "$APP_URL_FROM_ENV" ]; then
  CANONICAL_HOST="$(node -e 'try { console.log(new URL(process.argv[1]).host); } catch { process.exit(0); }' "$APP_URL_FROM_ENV" || true)"
  CANONICAL_ORIGIN="$(node -e 'try { console.log(new URL(process.argv[1]).origin); } catch { process.exit(0); }' "$APP_URL_FROM_ENV" || true)"
fi

if [ -n "$CURRENT_ALLOWED_HOSTS" ]; then
  EFFECTIVE_ALLOWED_HOSTS="${CURRENT_ALLOWED_HOSTS},${LOCAL_ALLOWED_HOSTS}"
else
  EFFECTIVE_ALLOWED_HOSTS="${LOCAL_ALLOWED_HOSTS}"
fi

if [ -n "$CANONICAL_HOST" ]; then
  EFFECTIVE_ALLOWED_HOSTS="${CANONICAL_HOST},${EFFECTIVE_ALLOWED_HOSTS}"
fi

if [ -n "$CURRENT_ALLOWED_ORIGINS" ]; then
  EFFECTIVE_ALLOWED_ORIGINS="${CURRENT_ALLOWED_ORIGINS},${LOCAL_ALLOWED_ORIGINS}"
else
  EFFECTIVE_ALLOWED_ORIGINS="${LOCAL_ALLOWED_ORIGINS}"
fi

if [ -n "$CANONICAL_ORIGIN" ]; then
  EFFECTIVE_ALLOWED_ORIGINS="${CANONICAL_ORIGIN},${EFFECTIVE_ALLOWED_ORIGINS}"
fi

# Proxy allowlist checks are evaluated from build-time env in Next proxy bundles.
# Rebuild with local allowlists before starting local E2E server.
NODE_ENV=production \
UPPOINT_ALLOWED_HOSTS="$EFFECTIVE_ALLOWED_HOSTS" \
UPPOINT_ALLOWED_ORIGINS="$EFFECTIVE_ALLOWED_ORIGINS" \
NEXT_SKIP_SERVICE_RESTART=1 \
npm run build >/dev/null

NODE_ENV=production \
UPPOINT_ALLOWED_HOSTS="$EFFECTIVE_ALLOWED_HOSTS" \
UPPOINT_ALLOWED_ORIGINS="$EFFECTIVE_ALLOWED_ORIGINS" \
npm run start -- --hostname "$HOST" --port "$PORT" >/tmp/uppoint-e2e-local.log 2>&1 &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 "$STARTUP_TIMEOUT_SECONDS"); do
  if curl -fsS "${BASE_URL}/tr/login" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "[e2e-local] App did not become ready at ${BASE_URL} within ${STARTUP_TIMEOUT_SECONDS}s" >&2
  echo "[e2e-local] Last local server logs:" >&2
  tail -n 120 /tmp/uppoint-e2e-local.log >&2 || true
  exit 1
fi

RUN_E2E=1 E2E_BASE_URL="$BASE_URL" E2E_ALLOW_MUTATIONS="${E2E_ALLOW_MUTATIONS:-1}" npx vitest run tests/e2e --testTimeout=30000
