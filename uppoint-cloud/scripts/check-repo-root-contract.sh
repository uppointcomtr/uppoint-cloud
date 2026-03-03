#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_REPO_ROOT="$(cd "${APP_ROOT}/.." && pwd)"
ACTUAL_GIT_ROOT="$(git -C "${APP_ROOT}" rev-parse --show-toplevel)"

if [ "${ACTUAL_GIT_ROOT}" != "${EXPECTED_REPO_ROOT}" ]; then
  echo "[repo-layout] FAIL: git root mismatch. expected=${EXPECTED_REPO_ROOT} actual=${ACTUAL_GIT_ROOT}" >&2
  exit 1
fi

if [ ! -f "${APP_ROOT}/AGENTS.md" ]; then
  echo "[repo-layout] FAIL: missing AGENTS.md at app root ${APP_ROOT}" >&2
  exit 1
fi

if [ ! -f "${ACTUAL_GIT_ROOT}/.github/workflows/remote-auth-smoke.yml" ]; then
  echo "[repo-layout] FAIL: missing canonical remote smoke workflow at ${ACTUAL_GIT_ROOT}/.github/workflows/remote-auth-smoke.yml" >&2
  exit 1
fi

echo "[repo-layout] OK: app root (${APP_ROOT}) and git root (${ACTUAL_GIT_ROOT}) contract is valid."
