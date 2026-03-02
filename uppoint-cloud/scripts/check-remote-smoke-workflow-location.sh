#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${APP_ROOT}/.." && pwd)"
ROOT_WORKFLOW="${REPO_ROOT}/.github/workflows/remote-auth-smoke.yml"
APP_WORKFLOW="${APP_ROOT}/.github/workflows/remote-auth-smoke.yml"

if [ ! -f "${ROOT_WORKFLOW}" ]; then
  echo "[workflow-layout] FAIL: missing canonical workflow at ${ROOT_WORKFLOW}" >&2
  exit 1
fi

if [ -f "${APP_WORKFLOW}" ]; then
  echo "[workflow-layout] FAIL: duplicate workflow found at ${APP_WORKFLOW}" >&2
  echo "[workflow-layout] Keep only repository-root workflow at ${ROOT_WORKFLOW}" >&2
  exit 1
fi

if ! grep -q "working-directory: uppoint-cloud" "${ROOT_WORKFLOW}"; then
  echo "[workflow-layout] FAIL: root workflow must use working-directory: uppoint-cloud" >&2
  exit 1
fi

echo "[workflow-layout] OK: canonical remote smoke workflow is rooted at ${ROOT_WORKFLOW}"
