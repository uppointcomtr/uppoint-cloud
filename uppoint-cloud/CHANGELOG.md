# Changelog

## 2026-03-05 (auth-ui fix: login phone tab click unblock)

### Fixed
- Fixed login mode toggle click behavior on `/[locale]/login`:
  - `modules/auth/components/login/login-mode-tabs.tsx` slider highlight now uses `pointer-events-none` and explicit `z-0`.
  - Prevents highlight layer from intercepting clicks so the `Telefon` tab can be selected reliably.

## 2026-03-04 (ops/ci hardening: default remote smoke enforcement in weekly security gate)

### Changed
- Updated weekly security-gate cron template:
  - `ops/cron/uppoint-security-gate-weekly` now sets:
    - `SECURITY_GATE_REQUIRE_REMOTE_SMOKE=1`
    - `E2E_ALLOW_MUTATIONS=0`
    - `E2E_BASE_URL=https://cloud.uppoint.com.tr`
- Updated docs to reflect new default:
  - `ops/README.md`
  - `ops/RUNTIME_SERVICES_AND_CRON.md`
  - `README.md`

## 2026-03-04 (ops/docs: remote auth smoke verification checklist)

### Changed
- Added explicit GitHub Actions remote smoke operational checklist:
  - `ops/README.md` now includes:
    - manual trigger command,
    - latest run verification command,
    - required guard-step success check (`Require healthcheck token for production target`),
    - run summary verification requirement (`E2E_HEALTHCHECK_TOKEN: configured`).
  - `README.md` now includes matching quick verification checklist for maintainers.

## 2026-03-04 (security/governance closure: F61-F65)

### Fixed
- Closed remote smoke enforcement gap in security gate (`F61`):
  - `scripts/verify-security-gate.sh` now supports `SECURITY_GATE_REQUIRE_REMOTE_SMOKE=1`.
  - When enabled, gate runs `npm run test:e2e:remote` in read-only mode (`E2E_ALLOW_MUTATIONS=0`).
- Closed findings freshness enforcement gap (`F62`):
  - Added `scripts/check-findings-freshness.mjs`.
  - Added package script `verify:findings-freshness`.
  - Wired into security gate.
- Closed restore-drill freshness enforcement gap (`F63`):
  - Added `scripts/check-restore-drill-freshness.sh`.
  - Added package script `verify:restore-drill-freshness`.
  - Wired into security gate (enforced when restore-drill cron is present).
- Closed security SLO low-sample signaling gap (`F64`):
  - `scripts/check-security-slo.mjs` now emits advisory `notification_terminal_sample_low`.
  - Added `SECURITY_SLO_WARN_ON_LOW_NOTIFICATION_SAMPLE` support.
  - Updated `scripts/run-security-slo-report.sh` and ops docs.
- Closed root repo hygiene drift (`F65`):
  - Added `actions-runner/` to `/opt/.gitignore`.

### Added
- New guardrail tests:
  - `tests/security/verify-security-gate-script-guardrail.test.ts`
  - `tests/security/findings-freshness-script-guardrail.test.ts`
  - `tests/security/restore-drill-freshness-script-guardrail.test.ts`

### Changed
- Updated docs:
  - `README.md` verification section now includes findings/restore freshness checks and strict gate example.
  - `ops/README.md` security SLO section now documents low-sample advisory behavior and related env key.
  - `FINDINGS_REGISTER.md` now tracks/closed `F61`–`F65`.

## 2026-03-04 (docs/governance closure: F55-F60)

### Fixed
- Closed closed-system policy wording drift in security roadmap (`F55`):
  - `ops/SECURITY_MAXIMIZATION_PLAN.md` now defines S3 as local immutable anchor baseline and moves off-host replication to explicit owner-approved exception path.
- Closed ops env example ambiguity (`F56`):
  - `ops/README.md` now separates `.env` examples into:
    - closed-system baseline
    - owner-approved external replication exception
- Closed production bootstrap env clarity gap (`F57`):
  - `README.md` now contains an explicit minimum required production env key set.
- Closed findings evidence freshness/process gap (`F58`):
  - `FINDINGS_REGISTER.md` now includes a revalidation policy with 30-day freshness expectations.
- Closed cron alert-path observability gap (`F59`):
  - `ops/RUNTIME_SERVICES_AND_CRON.md` now includes an `Alert path` column for each job.
- Closed documentation sync governance gap (`F60`):
  - `AGENTS.md` now includes a documentation sync matrix mapping change types to required docs updates.

### Changed
- Updated canonical findings register with `F55`–`F60` entries as `closed`.

## 2026-03-04 (security/ops closure: F50-F54)

### Fixed
- Closed adaptive rate-limit env-boundary gap (`F50`):
  - `lib/env/server.ts` now validates adaptive rate-limit keys centrally:
    - `AUTH_ADAPTIVE_RATE_LIMIT_ENABLED`
    - `AUTH_DEVICE_FINGERPRINT_HEADER`
    - `AUTH_CLIENT_ASN_HEADER`
    - `AUTH_ADAPTIVE_WINDOW_SECONDS`
    - `AUTH_ADAPTIVE_DEVICE_MAX`
    - `AUTH_ADAPTIVE_ASN_MAX`
    - `AUTH_ADAPTIVE_IDENTIFIER_DEVICE_MAX`
  - `lib/rate-limit.ts` now uses validated `env` values and no longer reads these settings via `process.env`.
  - Added guardrail test: `tests/security/rate-limit-adaptive-config-boundary.test.ts`.
- Closed closed-system cron catalog drift (`F51`):
  - `ops/RUNTIME_SERVICES_AND_CRON.md` now marks `uppoint-audit-anchor-replication` as template-only/optional in closed-system baseline.
- Closed stale Server Action UX fallback gap (`F52`):
  - Added stale-action detector: `lib/errors/stale-server-action.ts`.
  - Updated error boundaries:
    - `app/[locale]/error.tsx`
    - `app/global-error.tsx`
  - Stale-action failures now show localized refresh guidance instead of generic retry-only fallback.
  - Added unit test: `tests/security/stale-server-action-error.test.ts`.
- Closed remote smoke localization marker coverage gap (`F53`):
  - `tests/e2e/auth-http-smoke.test.ts` now validates baseline auth page markers for both TR and EN.
- Closed regex-only tenant guardrail weakness (`F54`):
  - `tests/tenant/tenant-guardrail.test.ts` now includes TypeScript AST checks for tenant-scoped Prisma model access.

### Changed
- Updated environment and operations documentation:
  - `README.md` includes adaptive rate-limit env vars and stale-action UI note.
  - `ops/RUNTIME_SERVICES_AND_CRON.md` clarifies replication cron deployment conditions.
- Updated findings register:
  - `FINDINGS_REGISTER.md` now tracks and closes `F50`–`F54`.

## 2026-03-04 (ops/ci: self-hosted remote smoke runner selection)

### Changed
- Updated remote smoke workflow runner model to support self-hosted execution by default:
  - `/opt/.github/workflows/remote-auth-smoke.yml` now pins execution to:
    - `runs-on: self-hosted`
- Updated workflow guardrails:
  - `tests/security/remote-smoke-workflow-guardrail.test.ts` now enforces the self-hosted runner pin contract.
- Updated operator docs:
  - `README.md` now documents runner-network requirement for audit-integrity checks.

## 2026-03-04 (security/ops closure: F46-F49)

### Fixed
- Closed remote smoke health fail-open gap (`F46`):
  - `/opt/.github/workflows/remote-auth-smoke.yml` now defaults `E2E_ENFORCE_HEALTH_200=1`.
  - Added explicit production guard that fails workflow when `E2E_HEALTHCHECK_TOKEN` is missing for `https://cloud.uppoint.com.tr`.
  - Extended workflow guardrail tests in `tests/security/remote-smoke-workflow-guardrail.test.ts`.
- Closed cron catalog drift (`F47`):
  - `ops/RUNTIME_SERVICES_AND_CRON.md` schedules were aligned with canonical cron templates (`ops/cron/*`).
- Closed closed-system local alert sink gap (`F48`):
  - `scripts/alert-auth-abuse.sh` now always emits on-host local alerts to `/var/log/uppoint-cloud/security-alerts.log` and syslog (`uppoint-security-alert`), including closed-system mode.
  - Added rotation for `/var/log/uppoint-cloud/security-alerts.log` in `ops/logrotate/uppoint-cloud`.
  - Added guardrail test `tests/security/auth-abuse-alert-script-guardrail.test.ts`.
- Closed tenant deny audit context propagation gap (`F49`):
  - `modules/tenant/server/scope.ts` now accepts optional `auditContext` (`ip`, `requestId`, `userAgent`, `forwardedFor`) and includes it in deny/insufficient-role audit metadata.
  - Added regression coverage in `tests/tenant/tenant-scope.test.ts`.

### Changed
- Updated remote smoke documentation:
  - `README.md` now documents production health token requirement and default strict health enforcement.
- Updated ops runbooks/catalog:
  - `ops/README.md` and `ops/RUNTIME_SERVICES_AND_CRON.md` now include local security-alert log path usage.
- Updated findings registry:
  - `FINDINGS_REGISTER.md` now tracks and closes `F46`–`F49`.

## 2026-03-04 (security/ops closure: F41-F45 + SLO calibration)

### Fixed
- Closed nginx drift gate fail-open gap (`F41`):
  - `scripts/verify-security-gate.sh` now runs nginx drift verification with `RATE_LIMIT_DRIFT_POLICY=enforce-baseline` by default.
- Closed auth repository-boundary drift (`F42`):
  - Added repository layer files:
    - `db/repositories/auth-login-repository.ts`
    - `db/repositories/auth-register-repository.ts`
    - `db/repositories/auth-password-reset-repository.ts`
    - `db/repositories/auth-user-repository.ts`
  - Refactored:
    - `modules/auth/server/login-challenge.ts`
    - `modules/auth/server/register-verification-challenge.ts`
    - `modules/auth/server/password-reset-challenge.ts`
    - `modules/auth/server/user-lifecycle.ts`
  - Added guardrail test: `tests/auth/auth-repository-boundary.test.ts` (blocks direct `prisma.*` usage in `modules/auth/server`).
- Closed proxy error-envelope contract gap (`F43`):
  - `proxy.ts` edge host/origin rejection responses now include stable `code` field.
- Closed restore-drill evidence gap (`F44`):
  - Executed check-only restore drill and wrote canonical runtime evidence to `/var/log/uppoint-postgres-restore-drill.log`.
- Closed dispatch forensic log gap (`F45`):
  - `scripts/dispatch-notifications.sh` success logs now include `requestId`, `inspected`, `sent`, `failed`.

### Changed
- Calibrated production SLO tolerance:
  - runtime `.env` value set to `SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE=5`.
- Updated findings registry:
  - `FINDINGS_REGISTER.md` now includes and closes `F41`–`F45`.

### Added
- New guardrail tests:
  - `tests/security/security-gate-nginx-drift-policy-guardrail.test.ts`
  - `tests/security/proxy-error-envelope-guardrail.test.ts`
  - `tests/security/dispatch-notifications-log-guardrail.test.ts`

## 2026-03-04 (security hardening: outbox terminal audit + tenant filter + SLO absolute alert)

### Fixed
- Closed notification observability security gap (`F38`):
  - `modules/notifications/server/outbox.ts` now emits `notification_delivery_terminal_failed` audit events when a notification reaches terminal `FAILED` status.
  - Added new audit action in `lib/audit-log.ts`.
- Closed tenant isolation consistency gap (`F39`):
  - `db/repositories/tenant-repository.ts` `findUserTenantIds` now excludes soft-deleted tenants (`tenant.deletedAt: null`).
- Closed low-volume alert blind spot in security SLO (`F40`):
  - `scripts/check-security-slo.mjs` now supports `SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE` (default `3`) and emits `notification_delivery_failed_absolute` violations.

### Added
- Added regression tests:
  - `tests/tenant/tenant-repository.test.ts`
  - `tests/security/security-slo-script-guardrail.test.ts`
- Extended notification outbox test coverage:
  - `tests/auth/notification-outbox.test.ts` now verifies terminal failure audit callback dispatch.

### Changed
- Updated ops security-SLO documentation:
  - `ops/README.md` now documents `SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE`.
- Updated findings registry:
  - `FINDINGS_REGISTER.md` now tracks and closes `F38`–`F40`.

## 2026-03-04 (ops hardening: weekly security-gate cron activation)

### Added
- Added weekly security-gate cron template:
  - `ops/cron/uppoint-security-gate-weekly`
  - Schedule: every Sunday `05:30`
  - Runs full `scripts/verify-security-gate.sh` and writes `/var/log/uppoint-security-gate-weekly.log`.

### Changed
- Updated operations runtime inventory and docs:
  - `ops/RUNTIME_SERVICES_AND_CRON.md`
  - `ops/README.md`
- Extended log rotation coverage:
  - `ops/logrotate/uppoint-cloud` now rotates `/var/log/uppoint-security-gate-weekly.log`.

## 2026-03-04 (ops closure: runtime deploy drift + cron governance drift)

### Fixed
- Closed runtime deploy drift (`F36`):
  - rebuilt and restarted production app with `npm run build:deploy` so running service aligns with repository HEAD.
  - live auth API error envelope now returns machine-readable `code` field as expected.
- Closed cron governance drift (`F37`):
  - moved PostgreSQL backup and DB cleanup schedules from unmanaged root crontab into canonical `/etc/cron.d` entries:
    - `/etc/cron.d/uppoint-postgres-backup`
    - `/etc/cron.d/uppoint-db-cleanup`
  - removed duplicate root crontab entries after taking backup.

### Changed
- Updated findings registry with new closed entries:
  - `F36`
  - `F37`

### Verification
- `npm run build:deploy`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run verify:security-gate`
- live checks:
  - `curl https://cloud.uppoint.com.tr/api/auth/register` (`code` field present)
  - `systemctl show -p ActiveEnterTimestamp uppoint-cloud.service`
  - `ls /etc/cron.d | rg '^uppoint-'`
  - `sudo crontab -l`

## 2026-03-04 (ops observability: weekly restore drill email reporting)

### Added
- Added restore drill report wrapper:
  - `scripts/run-restore-drill-with-report.sh`
  - Runs restore drill, captures output, and enqueues encrypted status email via `NotificationOutbox` (`scope=ops-restore-drill-report`).
  - Uses `UPPOINT_RESTORE_DRILL_EMAIL_TO` with fallback to `UPPOINT_ALERT_EMAIL_TO`.
  - Controlled by `UPPOINT_RESTORE_DRILL_EMAIL_ENABLED` (default `true`).

### Changed
- Weekly restore-drill cron now calls report wrapper:
  - `ops/cron/uppoint-postgres-restore-drill`
- Ops docs/runtime catalog updated:
  - `README.md`
  - `ops/README.md`
  - `ops/RUNTIME_SERVICES_AND_CRON.md`

### Tests
- Added guardrail test:
  - `tests/security/restore-drill-report-script-guardrail.test.ts`

## 2026-03-04 (ops safety hardening: restore drill kill-switch + target DB guardrails)

### Fixed
- Hardened PostgreSQL restore drill safety (`F34`):
  - `scripts/restore-drill-db.sh --execute --confirm` is now fail-closed unless `UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE=true`.
  - Added drill-target guardrails:
    - target DB must use `restore_drill_` prefix,
    - target DB must not match primary DB name,
    - reserved names (`postgres`, `template0`, `template1`) are blocked,
    - pre-existing drill target DB names are rejected.
  - Cleanup now drops DB only when the script actually created it, preventing accidental drop on create failures.

### Added
- Guardrail regression test:
  - `tests/security/restore-drill-script-guardrail.test.ts`

### Changed
- Operational docs/templates updated:
  - `README.md` env var list includes `UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE`.
  - `ops/README.md` restore-drill safety behavior documented.
  - `ops/RUNTIME_SERVICES_AND_CRON.md` restore-drill cron purpose now reflects execute gate.
  - `ops/cron/uppoint-postgres-restore-drill` comment now documents execute gate requirement.

## 2026-03-04 (security/ops closure: F28-F33)

### Fixed
- Closed security error-envelope drift (`F28`):
  - `lib/http/response.ts` now supports explicit `code` on failure payloads.
  - `lib/rate-limit.ts` and `lib/http/idempotency.ts` now return `{ success:false, error, code }` for machine-readable failure handling.
  - `modules/auth/components/shared/request-utils.ts` response contract now includes optional `code`.
- Closed audit fallback continuity gap (`F29`):
  - `lib/audit-log.ts` now recovers previous fallback chain hash from last valid fallback log entry when chain-state file is missing/corrupt.
  - Added regression case in `tests/auth/audit-fallback-integrity.test.ts`.
- Closed tenant guardrail coverage gap in scripts layer (`F30`):
  - `tests/tenant/tenant-guardrail.test.ts` now scans `scripts/` for direct tenant-table queries.
- Closed off-host replication safety gap (`F31`):
  - `scripts/replicate-audit-anchor.sh` now requires explicit `UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=true` in addition to closed-system opt-out.
  - Updated `README.md`, `ops/README.md`, `ops/RUNTIME_SERVICES_AND_CRON.md` with the dual-control requirement.
- Closed future admin/support authorization baseline gap (`F32`):
  - added deny-by-default platform permission primitives in `modules/auth/server/platform-rbac.ts`.
  - added guardrail tests `tests/security/platform-rbac.test.ts` and `tests/security/platform-route-guardrail.test.ts`.
- Closed security-SLO verification gap in security gate (`F33`):
  - added `scripts/check-security-slo.mjs` and wrapper `scripts/run-security-slo-report.sh`.
  - wired `npm run verify:security-slo` into `scripts/verify-security-gate.sh`.
  - added cron template `ops/cron/uppoint-security-slo-report` and logrotate coverage for `/var/log/uppoint-security-slo-report.log`.
  - added `SECURITY_SLO_MIN_NOTIFICATION_TERMINAL` (default `20`) to avoid low-sample false positives on notification failure-ratio alerts.

### Changed
- Ops docs and findings registry updated:
  - `FINDINGS_REGISTER.md` now tracks and closes `F28`–`F33` with evidence.
  - `ops/README.md` and runtime cron catalog include security SLO monitoring procedures.

## 2026-03-04 (security/architecture closure: F23-F27)

### Fixed
- Closed remote smoke mutation exposure on manual triggers (`F23`):
  - `.github/workflows/remote-auth-smoke.yml` now applies production mutation guard regardless of trigger type.
- Closed tenant-boundary drift in registration provisioning path (`F24`):
  - `modules/auth/server/register-verification-challenge.ts` now provisions tenant + membership through `db/repositories/tenant-repository.ts`.
  - `tests/tenant/tenant-guardrail.test.ts` tightened approved direct-access list and tenant-scoped model guardrails.
- Closed authorization model ambiguity (`F25`):
  - introduced centralized tenant capability map in `modules/tenant/server/permissions.ts`.
  - `modules/tenant/server/scope.ts` now evaluates minimum role through capability model.
- Closed audit fallback tamper-evidence gap (`F26`):
  - `lib/audit-log.ts` fallback sink now adds signed chain metadata and persists previous hash state.
  - `lib/env/server.ts` now supports `AUDIT_FALLBACK_CHAIN_STATE_PATH`.
- Closed restore-readiness automation gap (`F27`):
  - added `scripts/restore-drill-db.sh` (check-only + execute modes).
  - added cron template `ops/cron/uppoint-postgres-restore-drill`.
  - wired artifact check into `scripts/verify-security-gate.sh`.

### Added
- New tests:
  - `tests/auth/audit-fallback-integrity.test.ts`
  - `tests/security/remote-smoke-workflow-guardrail.test.ts`

### Changed
- Ops/runtime docs updated:
  - `README.md`
  - `ops/README.md`
  - `ops/RUNTIME_SERVICES_AND_CRON.md`
  - `ops/logrotate/uppoint-cloud`
- `package.json` adds `npm run verify:restore-drill` for backup artifact readiness checks.
- `FINDINGS_REGISTER.md` extended with `F23`–`F27` closure records.

## 2026-03-04 (security/ops closure: internal transport, audit redaction, dispatch hardening, nightly smoke safety)

### Fixed
- Closed internal transport-mode mismatch in production guarding (`F19`):
  - `lib/security/internal-route-guard.ts` now enforces loopback source only for `loopback-hmac-v1`.
  - `mtls-hmac-v1` path remains protected by token + request signature + verified client-cert headers.
- Closed audit metadata array redaction gap (`F20`):
  - `lib/audit-log.ts` now recursively redacts sensitive strings/keys inside arrays and nested objects.
- Closed production dispatch target override risk in loopback mode (`F21`):
  - `scripts/dispatch-notifications.sh` now blocks non-local production loopback dispatch unless explicit exception flags are set.

### Changed
- Remote smoke nightly safety policy hardened (`F22`):
  - `/opt/.github/workflows/remote-auth-smoke.yml` now fails scheduled runs when `E2E_ALLOW_MUTATIONS=1` targets `https://cloud.uppoint.com.tr`.
  - Mutation smoke remains allowed via manual workflow dispatch against isolated non-production targets.
- Documentation updated:
  - `README.md` nightly smoke guidance aligned with production-safe mutation policy.
  - `ops/README.md` dispatch override/transport guard behavior clarified.
  - `FINDINGS_REGISTER.md` extended with `F19`–`F22` closure evidence.

## 2026-03-03 (closed-system policy: no off-host egress by default)

### Changed
- Updated `AGENTS.md` with explicit closed-system policy:
  - default deny for off-host egress,
  - no third-party replication/telemetry by default,
  - owner-approved exception process for external egress.
- Updated operational docs for closed-system default:
  - `README.md`
  - `ops/README.md`
  - `ops/RUNTIME_SERVICES_AND_CRON.md`

### Fixed
- Made egress scripts closed-mode aware (`UPPOINT_CLOSED_SYSTEM_MODE=true` defaults to skip):
  - `scripts/replicate-audit-anchor.sh`
  - `scripts/alert-nginx-drift.sh`
  - `scripts/alert-edge-audit-emit.sh`
  - `scripts/alert-auth-abuse.sh`

## 2026-03-03 (ops hardening: cron activation + off-host WORM anchor replication + runtime catalog)

### Added
- Added off-host immutable replication script for audit anchors:
  - `scripts/replicate-audit-anchor.sh`
  - Uploads latest exported anchor to S3 object-lock target (`COMPLIANCE`/`GOVERNANCE`) and validates lock metadata via `head-object`.
  - Maintains replication state in `/var/lib/uppoint-cloud/audit-anchor-replication.state`.
- Added cron template for replication:
  - `ops/cron/uppoint-audit-anchor-replication`
- Added npm command:
  - `npm run audit:anchor:replicate`
- Added runtime operations inventory document:
  - `ops/RUNTIME_SERVICES_AND_CRON.md`

### Changed
- Activated new production cron jobs on host (`/etc/cron.d`):
  - `uppoint-audit-anchor-export`
  - `uppoint-auth-abuse-check`
- Expanded operations docs:
  - `ops/README.md` now includes object-lock replication env vars, replication cron install command, and manual verification command.
  - `README.md` now links runtime services/cron catalog.
- Extended logrotate coverage:
  - `ops/logrotate/uppoint-cloud` now rotates `/var/log/uppoint-audit-anchor-replication.log`.

## 2026-03-03 (security hardening: internal transport contract + tenant repository boundary + audit anchoring + abuse automation)

### Added
- Added tenant repository boundary for tenant model access:
  - `db/repositories/tenant-repository.ts`
  - Centralizes tenant membership/tenant query operations used by auth + tenant modules.
- Added external audit-anchor export pipeline:
  - `scripts/export-audit-anchor.mjs`
  - `scripts/export-audit-anchor.sh`
  - `ops/cron/uppoint-audit-anchor-export`
  - `npm run audit:anchor:export`
- Added auth abuse signal automation:
  - `scripts/check-auth-abuse-signals.mjs`
  - `scripts/run-auth-abuse-check.sh`
  - `scripts/alert-auth-abuse.sh`
  - `ops/cron/uppoint-auth-abuse-check`
  - `npm run verify:auth-abuse`
- Added operations runbook:
  - `ops/runbooks/secret-rotation.md`

### Changed
- Internal signed-route transport contract is now explicit and env-governed:
  - Added `INTERNAL_AUTH_TRANSPORT_MODE` validation in:
    - `lib/env/server.ts`
    - `lib/env/proxy.ts`
  - `proxy.ts` now stamps internal audit emit requests with `x-internal-transport` and validates trusted ingress shape against this header.
  - `scripts/dispatch-notifications.sh` now sends `x-internal-transport`.
- Refactored tenant usage to repository boundary:
  - `modules/tenant/server/scope.ts`
  - `modules/tenant/server/user-tenant.ts`
  - `modules/auth/server/user-lifecycle.ts`
  - `tests/tenant/tenant-guardrail.test.ts` allowlist updated to repository-centric enforcement.
- Updated internal auth guardrails and tests:
  - `tests/internal/internal-route-guardrail.test.ts`
  - `tests/security/internal-request-auth.test.ts`
  - `tests/security/proxy-internal-audit-guardrail.test.ts`
- Updated operations and environment docs:
  - `README.md`
  - `ops/README.md`
  - `ops/SECURITY_MAXIMIZATION_PLAN.md`
  - `ops/logrotate/uppoint-cloud`

## 2026-03-03 (security governance: security gate + hardening roadmap codified)

### Added
- Added dedicated security gate command:
  - `scripts/verify-security-gate.sh`
  - `npm run verify:security-gate`
  - Gate runs baseline verification plus layout guardrails and environment-aware integrity/drift checks.
- Added top-5 hardening roadmap document:
  - `ops/SECURITY_MAXIMIZATION_PLAN.md`
  - Tracks next high-impact controls: internal mTLS, immutable external audit anchoring, secret rotation operations, and abuse-response automation.

### Changed
- Updated `AGENTS.md` with five additional security governance controls:
  - mandatory use of `verify:security-gate` for security-sensitive surfaces,
  - explicit tenant-scope enforcement requirement in `db/` and `lib/` layers,
  - fail-closed requirement for security-critical dependency failures,
  - requirement that internal calls remain compatible with future mTLS,
  - immutable external audit-anchor requirement for forensic resilience.
- Updated docs to reference new security roadmap and gate:
  - `README.md`
  - `ops/README.md`

## 2026-03-03 (security closure: session invalidation, deprecated fail-closed, internal payload audit, auth-priority outbox)

### Fixed
- Closed password-reset session invalidation delay in production (`F14`):
  - `auth.ts` now disables JWT revalidation cache in production so `tokenVersion` changes are enforced immediately.
- Closed deprecated endpoint fail-open behavior under missing trusted IP context (`F15`):
  - `app/api/auth/verify-email/route.ts`
  - `app/api/auth/forgot-password/request/route.ts`
  - `app/api/auth/forgot-password/reset/route.ts`
  - production now returns `503 RATE_LIMIT_CONTEXT_UNAVAILABLE` when trusted client IP cannot be resolved.
- Closed internal audit payload blind spot (`F16`):
  - `app/api/internal/audit/security-event/route.ts` now logs `internal_audit_security_event_invalid_body` on JSON parse/schema failures.
  - `lib/audit-log.ts` includes the new audit action.

### Changed
- Reduced OTP delivery starvation risk under load (`F17`):
  - `modules/notifications/server/outbox.ts` now prioritizes auth-scoped notifications (`metadata.scope` prefixed with `auth-`) in dispatch candidate ordering.
- Strengthened tenant boundary guardrail scan coverage:
  - `tests/tenant/tenant-guardrail.test.ts` now scans `db/` and `lib/` in addition to `app/` and `modules/` for unreviewed direct tenant queries.

### Added
- New regression tests:
  - `tests/auth/deprecated-routes-rate-limit-context.test.ts`
  - extended `tests/internal/security-event-route.test.ts` with invalid-body audit coverage.
- Stabilized deprecated route unit tests by mocking limiter behavior:
  - `tests/auth/deprecated-verify-email-route.test.ts`
  - `tests/auth/deprecated-forgot-password-routes.test.ts`

## 2026-03-03 (ops/security: edge telemetry alerting + internal guardrail standardization)

### Added
- Added edge telemetry emit failure monitoring and alert pipeline:
  - `scripts/run-edge-audit-emit-check.sh` scans `uppoint-cloud.service` logs for `[edge-audit-emit] failed` and applies cooldown-based dedupe.
  - `scripts/alert-edge-audit-emit.sh` sends Slack alerts and/or enqueues encrypted outbox email alerts.
  - `ops/cron/uppoint-edge-audit-emit-check` provides periodic monitoring (`*/5`).
  - `ops/logrotate/uppoint-cloud` now rotates `/var/log/uppoint-cloud/edge-audit-emit-check.log`.
- Added internal route guardrail regression test:
  - `tests/internal/internal-route-guardrail.test.ts` asserts both internal routes enforce signed auth + loopback source + replay limiter.
- Added verification script shortcut:
  - `npm run verify:edge-audit-emit`

### Changed
- Documentation updates:
  - `README.md` now lists edge-audit alert env vars and cron setup.
  - `ops/README.md` now includes edge-audit monitoring runbook and configuration.
  - `FINDINGS_REGISTER.md` now tracks and closes `F12`.
- Alert SQL execution hardened for portability (`F13`):
  - `scripts/alert-edge-audit-emit.sh` and `scripts/alert-nginx-drift.sh` now use `psql -f` + `-v` variable binding.
  - avoids inline `-c` interpolation failures (`syntax error at or near ":"`) and restores reliable outbox email enqueue.

## 2026-03-03 (security closure: close F10/F11 edge telemetry reliability)

### Fixed
- Closed edge security telemetry delivery conflict (`F10`):
  - `proxy.ts` now applies a **narrow trusted-ingress exception** only for `POST /api/internal/audit/security-event` when request shape matches signed internal audit headers and `x-real-ip` is loopback.
  - Host/origin guards remain active for all non-trusted traffic; bypass is not global.
  - Edge emitter now includes `x-real-ip: 127.0.0.1` to satisfy production fail-closed rate-limit context requirements on internal route ingress.
- Closed silent telemetry-drop gap (`F11`):
  - `emitEdgeSecurityAudit` now logs structured failure signals (`[edge-audit-emit] failed`) instead of silently swallowing all emit errors.

### Added
- Added proxy guardrail tests:
  - `tests/security/proxy-internal-audit-guardrail.test.ts`
  - Asserts trusted ingress bypass remains narrowly scoped and failure logging remains present.

## 2026-03-03 (security closure: internal source hardening + audit delete guard + logout idempotency)

### Fixed
- Closed internal operational endpoint exposure gap (`F4`):
  - `lib/security/internal-request-auth.ts` now supports `requireLoopbackSource` and rejects validly signed requests from non-loopback sources when enabled.
  - `app/api/internal/audit/security-event/route.ts` and `app/api/internal/notifications/dispatch/route.ts` now enforce loopback-only internal source in production.
  - `proxy.ts` now sends edge security audit events to loopback by default (`http://127.0.0.1:3000/api/internal/audit/security-event`) with optional override via `INTERNAL_AUDIT_ENDPOINT_URL`.
  - `ops/nginx/cloud.uppoint.com.tr.conf` now restricts `/api/internal/*` to loopback clients.
- Closed NextAuth secondary limiter scoping weakness (`F5`):
  - `app/api/auth/[...nextauth]/route.ts` now keys secondary limiter by `action + clientIp`.
- Closed audit-log delete immutability gap (`F8`):
  - Added migration `prisma/migrations/20260303200000_enforce_audit_log_delete_guard/migration.sql`.
  - `AuditLog` deletes are now blocked unless retention guard session setting is explicitly enabled.
  - `scripts/cleanup-db.sh` now enables retention guard only for controlled cleanup delete query.
  - `scripts/verify-audit-integrity.mjs` now checks required immutable triggers (`tr_audit_log_no_update`, `tr_audit_log_no_delete`).
- Closed logout duplicate-submission risk (`F9`):
  - `app/api/auth/logout/route.ts` is now wrapped with `withIdempotency("auth:logout", ...)`.

### Added
- Closed repository/app-root drift ambiguity (`F6`) with explicit contract checks:
  - Added `scripts/check-repo-root-contract.sh`.
  - Added `npm run verify:repo-layout` and wired into `npm run verify`.
  - Added workflow step in `/opt/.github/workflows/remote-auth-smoke.yml` to enforce this contract.
- Closed instances module boundary guardrail gap (`F7`) with enforceable tests:
  - Added `tests/instances/instances-surface-guardrail.test.ts` to enforce tenant guard presence on future `/instances` entry points and block direct hypervisor coupling in `modules/instances/server`.
- Added regression tests:
  - `tests/security/internal-request-auth.test.ts` now covers loopback-required accept/reject behavior.
  - `tests/auth/nextauth-route-rate-limit.test.ts` verifies NextAuth secondary limiter key includes action + IP.

### Changed
- Documentation updates:
  - `README.md` now documents `INTERNAL_AUDIT_ENDPOINT_URL`, loopback enforcement for internal routes, and `verify:repo-layout`.
  - `ops/README.md` now documents loopback-only internal route production guard.

## 2026-03-03 (security closure: robust hash compare + verify idempotency + audit completeness)

### Fixed
- Hardened security-critical hash comparisons against malformed digest inputs:
  - Added centralized `timingSafeEqualText()` / `timingSafeEqualHex()` helper in `lib/security/constant-time.ts`.
  - Updated auth verification flows to use strict constant-time hex comparison with length/format guards:
    - `modules/auth/server/login-challenge.ts`
    - `modules/auth/server/register-verification-challenge.ts`
    - `modules/auth/server/password-reset-challenge.ts`
  - Updated internal token checks and health-token verification to use centralized constant-time text comparison:
    - `lib/security/internal-request-auth.ts`
    - `app/api/health/route.ts`
- Closed duplicate submission risk on OTP verification endpoints by adding idempotency wrappers:
  - `app/api/auth/login/challenge/email/verify/route.ts`
  - `app/api/auth/login/challenge/phone/verify/route.ts`
  - `app/api/auth/forgot-password/challenge/verify-sms/route.ts`
- Closed login OTP failure audit gaps:
  - login verify routes now emit `login_otp_failed` consistently for validation failures and rejected/expired challenges.

### Added
- New security unit tests for constant-time helpers:
  - `tests/security/constant-time.test.ts`
- Updated auth service tests to use realistic SHA-256 style hex mocks where timing-safe hash checks are exercised:
  - `tests/auth/login-challenge.test.ts`
  - `tests/auth/register-verification-challenge.test.ts`
  - `tests/auth/password-reset-challenge.test.ts`

## 2026-03-03 (governance: canonical findings register)

### Changed
- Added canonical findings governance file:
  - `FINDINGS_REGISTER.md` now defines stable finding IDs, status model, closure evidence, and register update discipline.
- Linked findings governance from `README.md`:
  - Added a dedicated section pointing to `FINDINGS_REGISTER.md` and required usage rules.

## 2026-03-03 (security closure: F1-F9 follow-up, auth-first + instances boundary scaffold)

### Fixed
- Closed idempotency persistence silent-failure path:
  - `lib/http/idempotency.ts` now retries response persistence and marks responses with `X-Idempotency-Persisted: false` when cache persistence ultimately fails.
  - Keeps pending reservation alive longer on persist failure to reduce replay race windows.
  - Added regression coverage in `tests/http/idempotency.test.ts`.
- Closed register challenge replacement race type gap:
  - `modules/auth/server/register-verification-challenge.ts` now includes `replacePendingChallengeByEmail` in typed challenge-issuance dependencies.
- Closed proxy env drift from validated source:
  - `proxy.ts` now reads environment through `lib/env/proxy.ts` instead of raw scattered `process.env` access.
- Closed deprecated-route test audit-noise gap:
  - `tests/auth/deprecated-forgot-password-routes.test.ts` and `tests/auth/deprecated-verify-email-route.test.ts` now mock `logAudit` and assert deprecation audit calls explicitly.

### Changed
- Added fairer notification outbox candidate selection:
  - `modules/notifications/server/outbox.ts` now uses scope-aware partitioned selection to reduce starvation risk from a single tenant/user/global scope dominating the batch.
- Strengthened remote smoke workflow guardrail:
  - `.github/workflows/remote-auth-smoke.yml` now runs `npm run verify:workflow-layout` before smoke execution.
- Increased local E2E mutation coverage by default:
  - `scripts/run-e2e-smoke-local.sh` now defaults `E2E_ALLOW_MUTATIONS=1` (can still be overridden to `0` explicitly).
- Introduced KVM/VPS architecture boundary scaffold (no feature implementation yet):
  - Added `modules/instances/domain/contracts.ts`
  - Added `modules/instances/server/security-boundary.ts`
  - Added `modules/instances/README.md`
  - Added tests: `tests/instances/security-boundary.test.ts`
  - Updated architecture docs in `README.md`.

## 2026-03-02 (hotfix: audit advisory lock signature portability)

### Fixed
- Fixed PostgreSQL function signature mismatch in audit-chain lock acquisition:
  - `lib/audit-log.ts` now casts advisory lock keys to `integer` when calling `pg_advisory_xact_lock(...)`.
  - This prevents runtime fallback logging caused by `pg_advisory_xact_lock(bigint, bigint)` mismatch and restores normal DB-backed audit writes.

## 2026-03-02 (finding closure: audit hash verification + deprecated endpoint telemetry + outbox scope columns)

### Fixed
- Closed audit-integrity verification blind spot:
  - `scripts/verify-audit-integrity.mjs` now recomputes and validates per-row HMAC integrity hashes (not only chain continuity).
  - Added constant-time hash comparison and explicit mismatch reporting (`HASH_MISMATCH`).
  - Added integrity schema evolution handling:
    - `v2` rows are cryptographically revalidated.
    - `v1` rows are treated as legacy continuity-only.
  - `lib/audit-log.ts` now writes deterministic `v2` integrity hashes (stable canonical payload ordering).
  - `scripts/verify-audit-integrity.sh` now loads `AUDIT_LOG_SIGNING_SECRET`/`AUTH_SECRET` from `.env` for cryptographic verification.
- Reduced client-side error leakage:
  - `app/global-error.tsx` no longer logs raw error objects in production.
- Closed register/login identifier limiter gaps:
  - `app/api/auth/register/route.ts` now applies phone-based identifier rate limiting in addition to email.
  - `app/api/auth/login/challenge/phone/start/route.ts` now normalizes phone value before identifier limit checks.
- Closed deprecated auth endpoint observability gap:
  - `/api/auth/forgot-password/request`, `/api/auth/forgot-password/reset`, and `/api/auth/verify-email` now apply limiter guards and emit `deprecated_endpoint_access` audit events.
  - Preserved deterministic deprecation contract for legacy endpoints: when trusted client IP is unavailable, routes still return `410 ENDPOINT_DEPRECATED` (not infrastructure `503`) while keeping identifier-based throttling and audit telemetry.
  - `lib/audit-log.ts` updated with `deprecated_endpoint_access` action.
- Closed phone input controlled-state drift:
  - `modules/auth/components/phone-input.tsx` now syncs internal state when parent `value` changes.

### Changed
- Improved tenant query guardrail coverage:
  - `tests/tenant/tenant-guardrail.test.ts` now blocks unreviewed direct tenant model queries in app/modules server code (with explicit approved list).
- Improved notification outbox forensic scope:
  - Added nullable `tenantId` and `userId` columns/indexes to `NotificationOutbox`.
  - Files:
    - `prisma/schema.prisma`
    - `prisma/migrations/20260302201000_add_notification_outbox_scope_columns/migration.sql`
    - `modules/notifications/server/outbox.ts`
    - auth enqueue call sites in login/password-reset services.
- Updated verification command contract:
  - `npm run verify` now runs build-only verification (`next build`) plus workflow-layout guardrail.
  - Added `npm run verify:deploy` for explicit verify + service restart flow.
  - `README.md` verification section updated accordingly.

## 2026-03-02 (audit hardening follow-up: login IP context + metadata schema + verification matrix)

### Fixed
- Added trusted client-IP resolution for real `login_success` audit events in `auth.ts` Credentials authorize flow (uses `x-real-ip`/`x-forwarded-for` with production fail-closed semantics).
- Strengthened audit metadata contract in `lib/audit-log.ts`:
  - every record now includes `metadata.audit` envelope with required fields: `schemaVersion`, `action`, `result`, `reason`, `requestId`
  - retained tamper-evident chain fields under `metadata.integrity`.
- Expanded audit guardrail tests in `tests/auth/audit-log.test.ts` to assert required metadata envelope fields.

### Changed
- Added explicit **Verification matrix** in `AGENTS.md` to separate:
  - baseline local verification,
  - production deploy verification (`build` + `build:deploy`),
  - nightly remote smoke expectations.

## 2026-03-02 (governance update: AGENTS.md policy refresh)

### Changed
- Updated `AGENTS.md` with stricter governance and audit protocol guidance:
  - expanded **Core Directives** with explicit **Zero Trust by Default**
  - added **Zero Trust + System Integrity Review Protocol (Audit Mode)** section with mandatory A-H audit output structure
  - tightened language around token/OTP handling, neutral error surfaces, and internal-call trust assumptions
  - clarified verification vs deployment distinction (`build` for verification, `build:deploy` for explicit deploy/restart flows)
  - aligned CI/verification wording for type-check/build script preference

## 2026-03-02 (finding closure: internal audit coverage, idempotency fail-closed, workflow/ops hardening)

### Fixed
- Closed internal endpoint unauthorized/replay audit gaps:
  - `app/api/internal/notifications/dispatch/route.ts` now logs `internal_dispatch_unauthorized` on failed internal auth.
  - `app/api/internal/audit/security-event/route.ts` now logs `internal_audit_security_event_unauthorized` and `internal_audit_security_event_replay_blocked`.
  - Added regression tests:
    - `tests/internal/notifications-dispatch-route.test.ts`
    - `tests/internal/security-event-route.test.ts`
- Closed idempotency storage fail-open behavior:
  - `lib/http/idempotency.ts` now fails closed with `503 IDEMPOTENCY_STORAGE_UNAVAILABLE` when storage reservation fails.
  - Added unit coverage in `tests/http/idempotency.test.ts`.
- Closed route protection default-catch-all drift risk:
  - `modules/auth/server/route-access.ts` no longer auto-protects unknown paths; only explicit protected registry is enforced.
  - Updated tests in `tests/auth/route-access.test.ts`.
- Closed stale login error semantics for OTP-only onboarding:
  - `modules/auth/server/login-challenge.ts` no longer throws `EMAIL_NOT_VERIFIED`; returns neutral no-challenge response.
  - Removed stale `EMAIL_NOT_VERIFIED` mapping in `modules/auth/components/login-form.tsx` and dictionaries (`messages/tr.ts`, `messages/en.ts`).
  - Updated `tests/auth/login-challenge.test.ts`.

### Changed
- Added workflow location guardrail:
  - new script: `scripts/check-remote-smoke-workflow-location.sh`
  - new npm command: `npm run verify:workflow-layout`
- Tightened nightly remote smoke coverage policy:
  - `.github/workflows/remote-auth-smoke.yml` now enforces `E2E_ALLOW_MUTATIONS=1` for scheduled/nightly runs.
- Added optional CI audit-integrity verification hook:
  - `.github/workflows/remote-auth-smoke.yml` now runs `npm run verify:audit-integrity` when secret `AUDIT_INTEGRITY_DATABASE_URL` is configured.
  - workflow summary now reports audit-integrity check state (`passed|skipped`).
- Updated verify pipeline contract:
  - `package.json` `verify` now uses `npm run build:deploy` instead of `npm run build`.
- Added audit-integrity operational automation:
  - new scripts: `scripts/verify-audit-integrity.sh`, `scripts/verify-audit-integrity.mjs`
  - new npm command: `npm run verify:audit-integrity`
  - new cron template: `ops/cron/uppoint-audit-integrity-check`
  - updated logrotate coverage for `/var/log/uppoint-audit-integrity-check.log`

### Security Hardening
- Reduced secrets exposure risk in ops scripts:
  - `scripts/lib/env-reader.sh` now provides PostgreSQL URL parsing + `PG*` environment export helper.
  - `scripts/backup-db.sh`, `scripts/cleanup-db.sh`, `scripts/restore-db.sh`, and `scripts/alert-nginx-drift.sh` now use `PG*` env connection settings instead of passing `DATABASE_URL` in `psql/pg_dump` argv.
  - `scripts/dispatch-notifications.sh` no longer passes signing secret via `openssl -hmac` argv.
- Removed crypto duplication between app and ops alert path:
  - added shared core module `modules/notifications/server/payload-crypto-core.mjs` (+ `.d.ts`).
  - `modules/notifications/server/payload-crypto.ts` and `scripts/alert-nginx-drift.sh` now use the same encryption core.
- Encrypted outbox PII-at-rest for alerts and app notifications:
  - `modules/notifications/server/outbox.ts` now seals `recipient`, `subject`, and `body`.
  - `scripts/alert-nginx-drift.sh` now inserts sealed `recipient` and `subject`.
- Added tamper-evident audit metadata chain:
  - `lib/audit-log.ts` now writes `metadata.integrity` (`version`, `previousHash`, `hash`) using HMAC-SHA256.
  - Added optional env support `AUDIT_LOG_SIGNING_SECRET` in `lib/env/server.ts`.
  - Updated unit coverage in `tests/auth/audit-log.test.ts`.
- Strengthened tenant-scale guardrail:
  - `tests/tenant/tenant-guardrail.test.ts` now blocks direct `prisma.tenantMembership`/`prisma.tenant` usage in app entry points without tenant guard helpers.

## 2026-03-02 (finding closure: 2-8 follow-up + stack clarification)

### Changed
- Clarified stack wording across project instructions/docs:
  - `AGENTS.md`: database stack is explicitly `PostgreSQL (self-hosted) + Prisma`.
  - `README.md`: stack/verification wording aligned with self-hosted PostgreSQL and deploy verification flow.
  - `ops/README.md`: PostgreSQL deployment note and cron guidance aligned with current architecture.

### Fixed
- Closed **finding #2** (remote smoke default target drift):
  - `tests/e2e/auth-http-smoke.test.ts` default base URL is `https://cloud.uppoint.com.tr`.
  - `package.json` `test:e2e:remote` now defaults `E2E_BASE_URL` to `https://cloud.uppoint.com.tr`.
- Closed **finding #3** (ops alert email outbox encryption bypass):
  - `scripts/alert-nginx-drift.sh` now seals NotificationOutbox email payloads with the same `enc:v1` AES-GCM format used by app outbox logic.
  - Script now fails closed when email alerts are configured but `NOTIFICATION_PAYLOAD_SECRET` is missing.
- Closed **finding #4** (tenant guardrail coverage gap):
  - `tests/tenant/tenant-guardrail.test.ts` extended to cover tenant-aware server module entry points, not only app route/page/action files.
- Closed **finding #5** (rate-limit IP context risk):
  - `lib/rate-limit.ts` now fails closed in production with `503 RATE_LIMIT_CONTEXT_UNAVAILABLE` if trusted client IP cannot be resolved.
  - Added regression tests: `tests/security/rate-limit-context.test.ts`.
- Closed **finding #6** (self-hosted PostgreSQL wording drift):
  - `lib/env/server.ts` SSL validation message updated to generic non-local PostgreSQL wording.
  - `scripts/tune-system.sh` local PostgreSQL tuning skip message aligned with self-hosted/external PostgreSQL model.
- Closed **finding #7** (notification dispatcher cron least-privilege gap):
  - `ops/cron/uppoint-notification-dispatch` now runs dispatcher as `www-data` via `runuser`, with root-owned lock/log management.
  - `ops/README.md` updated with least-privilege execution note.
- Closed **finding #8** (protected-route intent drift visibility):
  - `modules/auth/server/route-access.ts` now exports route intent registries and explicit protected-rule matcher.
  - Added route-intent guardrails:
    - `tests/auth/route-access.test.ts`
    - `tests/auth/route-intent-guardrail.test.ts`

## 2026-03-02 (ci bugfix: allow_mutations input no longer overrides repo variable)

### Fixed
- Removed `workflow_dispatch.inputs.allow_mutations.default: "0"` from `.github/workflows/remote-auth-smoke.yml`.
- Updated `E2E_ALLOW_MUTATIONS` env binding to `inputs.allow_mutations || vars.E2E_ALLOW_MUTATIONS || '0'`.
- Manual dispatch runs now honor repository variable fallback when `allow_mutations` is not explicitly provided.

## 2026-03-02 (ci bugfix: enforce_health_200 input no longer overrides repo variable)

### Fixed
- Removed `workflow_dispatch.inputs.enforce_health_200.default: "0"` from `.github/workflows/remote-auth-smoke.yml`.
- This restores intended fallback behavior so repo variable `E2E_ENFORCE_HEALTH_200` is honored when the dispatch input is not explicitly provided.

## 2026-03-02 (ci observability: optional health guard for remote smoke)

### Changed
- Added workflow-dispatch input `enforce_health_200` (`0`/`1`) to `.github/workflows/remote-auth-smoke.yml`.
- Added `E2E_ENFORCE_HEALTH_200` env binding (dispatch input or repository variable fallback).
- Added `Enforce health endpoint policy` step:
  - when guard is enabled, workflow fails if health probe `final_code` is not `200`
  - default guard mode remains disabled (`0`) for non-blocking nightly behavior
- Summary now includes `Health guard` mode value for run-level visibility.

## 2026-03-02 (ci observability: remote health status in smoke summary)

### Changed
- Added `Probe health endpoint` step to `.github/workflows/remote-auth-smoke.yml`.
- Remote smoke summary now prints `Health endpoint` result with token-aware probing logic:
  - `200` (open or success)
  - `200 (token auth)` when first probe is `401` and token-authenticated retry succeeds
  - `401 (token required, token missing)` for missing secret in token-gated setups
  - `network_error` fallback on transport-level failures

## 2026-03-02 (ci observability: robust smoke duration timing)

### Fixed
- Remote smoke workflow summary duration now uses an explicit per-job captured epoch baseline instead of `github.run_started_at` context.
- Added `Capture run timing baseline` step and switched summary duration computation to `steps.timing.outputs.start_epoch`.
- Added numeric guard fallback to avoid empty/invalid duration inputs in summary generation.

## 2026-03-02 (ci observability: remote auth smoke summary step)

### Changed
- Added a dedicated GitHub Actions step to publish a concise per-run summary to job summary output:
  - file: `.github/workflows/remote-auth-smoke.yml`
  - fields: run URL, pass/fail status, duration, target base URL, mutation mode, and `E2E_HEALTHCHECK_TOKEN` presence state.

### Notes
- Production health endpoint is token-gated when `HEALTHCHECK_TOKEN` is set.
- Repository secret existence check via `GET /actions/secrets` requires a PAT with repository administration scope; current token cannot list secrets (`Resource not accessible by personal access token`), so secret validation was performed via workflow runtime behavior.

## 2026-03-02 (security closure: findings 1-7 follow-up)

### Fixed
- Closed login challenge start enumeration leaks:
  - `app/api/auth/login/challenge/email/start/route.ts`
  - `app/api/auth/login/challenge/phone/start/route.ts`
  - non-validation failures now return neutral `200` challenge shape; detailed reasons remain audit-only.
- Removed duplicate remote smoke workflow copy to eliminate CI drift:
  - deleted `uppoint-cloud/.github/workflows/remote-auth-smoke.yml`
  - canonical workflow remains repository root: `.github/workflows/remote-auth-smoke.yml`
- Added replay resistance requirements to internal signed requests:
  - `lib/security/internal-request-auth.ts` now requires signed `x-internal-request-id` in canonical signature verification.
  - internal audit/dispatch routes now enforce single-use replay window via identifier limiter.
- Improved internal dispatch observability/audit coverage:
  - `app/api/internal/notifications/dispatch/route.ts` now emits `internal_dispatch_success`, `internal_dispatch_failed`, and `internal_dispatch_replay_blocked` audit events.
  - `scripts/dispatch-notifications.sh` now sends `x-request-id` + `x-internal-request-id`.
- Hardened idempotency fallback scope behavior:
  - `lib/http/idempotency.ts` now rejects ambiguous production requests with `IDEMPOTENCY_SCOPE_UNRESOLVED` when only global fallback subject is available.
- Reduced health endpoint log detail leakage:
  - `app/api/health/route.ts` now logs sanitized error reason instead of raw error objects.
- Added tenant-scope guardrail test for app entry points:
  - `tests/tenant/tenant-guardrail.test.ts` enforces explicit `assertTenantAccess()` or `resolveUserTenantContext()` usage when tenant scope is referenced.

### Documentation
- Updated internal endpoint security header documentation:
  - `README.md`
  - `ops/README.md`

### Tests
- Updated/added:
  - `tests/security/internal-request-auth.test.ts`
  - `tests/http/idempotency.test.ts`
  - `tests/tenant/tenant-guardrail.test.ts`

## 2026-03-02 (ci sync: root remote smoke workflow allow_mutations input)

### Fixed
- Updated canonical GitHub Actions workflow at repository root:
  - `.github/workflows/remote-auth-smoke.yml`
- Added `workflow_dispatch` input:
  - `allow_mutations` (default `0`)
- `E2E_ALLOW_MUTATIONS` is now sourced from workflow dispatch input to keep remote/manual smoke behavior configurable and synchronized with expected API contract.

## 2026-03-02 (security closure batch: internal request signing, workflow recovery, audit archive retention)

### Fixed
- Restored canonical nightly remote smoke workflow inside repository root:
  - added `.github/workflows/remote-auth-smoke.yml`
  - nightly schedule (`00:15 UTC`) + `workflow_dispatch` preserved
  - workflow now runs from repository root (`package-lock.json` cache path fixed)
- Hardened locale error boundary logging:
  - `app/[locale]/error.tsx` now avoids printing raw runtime errors in production browser consoles.
- Added audit archive-before-delete retention path:
  - `scripts/cleanup-db.sh` now archives old `AuditLog` rows to compressed JSONL under `/opt/backups/audit` (configurable) before retention deletion.

### Changed
- Internal endpoint hardening expanded:
  - `app/api/internal/audit/security-event/route.ts` and `app/api/internal/notifications/dispatch/route.ts` now require token + signed request headers and apply IP + identifier limiter layers.
  - `proxy.ts` now emits signed edge security-audit events.
  - `scripts/dispatch-notifications.sh` now signs dispatch requests (`x-internal-request-ts`, `x-internal-request-signature`).
- Notification outbox payload-at-rest protection:
  - `modules/notifications/server/outbox.ts` now seals stored body payloads and decrypts on dispatch.
  - new helper: `modules/notifications/server/payload-crypto.ts`.
- Route protection policy tightened:
  - `modules/auth/server/route-access.ts` treats unknown non-explicit pages as protected by default.

### Added
- New internal request authentication helper:
  - `lib/security/internal-request-auth.ts`
- New tests:
  - `tests/security/internal-request-auth.test.ts`
  - `tests/auth/payload-crypto.test.ts`
  - extended `tests/auth/route-access.test.ts` for secure-by-default behavior

### Documentation
- Updated workflow path and internal signed-endpoint documentation:
  - `README.md`
  - `ops/README.md`

## 2026-03-02 (ops runbook: internal token rotation)

### Documentation
- Added production runbook for rotating internal endpoint tokens:
  - `INTERNAL_AUDIT_TOKEN`
  - `INTERNAL_DISPATCH_TOKEN`
- Documented cutover behavior, verification commands, and rollback steps in:
  - `ops/README.md`

## 2026-03-02 (security hardening follow-up: internal token isolation, idempotency lock, ops script safety)

### Fixed
- Hardened internal audit ingest authentication:
  - `app/api/internal/audit/security-event/route.ts` now fails closed when `INTERNAL_AUDIT_TOKEN` is missing (empty expected token no longer authenticates).
- Reduced idempotency race risk with explicit pending-slot reservation:
  - `lib/http/idempotency.ts` now creates a pending record, waits briefly for in-flight completion, and returns `409 IDEMPOTENCY_IN_PROGRESS` when a concurrent request is still processing.
  - updated test coverage in `tests/http/idempotency.test.ts`.
- Closed notification outbox `updatedAt` insert/default drift:
  - raw outbox insert/update paths now always set `updatedAt` in `modules/notifications/server/outbox.ts`.
  - added migration `prisma/migrations/20260302113000_set_notification_outbox_updated_at_default/migration.sql`.
- Added missing success audit events for auth verification steps:
  - `app/api/auth/register/challenge/verify-email/route.ts`
  - `app/api/auth/forgot-password/challenge/verify-email/route.ts`
  - `app/api/auth/forgot-password/challenge/verify-sms/route.ts`
- Improved JWT revocation freshness:
  - `auth.ts` now checks session-JTI revocation before returning early via revalidation window.
- Removed unused legacy module:
  - deleted `modules/auth/server/email-verification.ts` (link-based verification surface is deprecated).

### Changed
- Internal dispatcher endpoint token isolation:
  - `app/api/internal/notifications/dispatch/route.ts` now requires `x-internal-dispatch-token` (`INTERNAL_DISPATCH_TOKEN`) instead of `HEALTHCHECK_TOKEN`.
  - `proxy.ts` now reads `INTERNAL_AUDIT_TOKEN` instead of reusing `AUTH_SECRET`.
  - `lib/env/server.ts` now validates `INTERNAL_AUDIT_TOKEN` and `INTERNAL_DISPATCH_TOKEN` in production.

### Ops / Docs
- Hardened operational scripts against token/process leakage and temp-file collisions:
  - `scripts/health-probe.sh`
  - `scripts/dispatch-notifications.sh`
  - both now use `mktemp` + cleanup trap; token headers are passed via temporary header files.
- Added log rotation for notification dispatch cron log:
  - `ops/logrotate/uppoint-cloud` now rotates `/var/log/uppoint-cloud/dispatch-notifications.log`.
- Updated operational docs and environment references:
  - `README.md`
  - `ops/README.md`

## 2026-03-02 (auth surface cleanup: OTP-only registration model)

### Changed
- Deprecated legacy email-link verification endpoint:
  - `GET /api/auth/verify-email` -> `410 ENDPOINT_DEPRECATED`
  - `POST /api/auth/verify-email` -> `410 ENDPOINT_DEPRECATED`
  - file: `app/api/auth/verify-email/route.ts`
- Updated verify-email pages to redirect to sign-in:
  - `app/[locale]/verify-email/page.tsx`
  - `app/verify-email/page.tsx`
- Removed unused verify-email UI surface and translation payload tied to link-based verification:
  - deleted `modules/auth/components/verify-email-status.tsx`
  - removed `emailVerification` dictionaries from `messages/tr.ts` and `messages/en.ts`
  - removed `metadata.verifyEmail` dictionary entries and aligned verify-email page metadata to login metadata

### Documentation
- Updated security hardening notes in `README.md` to reflect OTP-only registration verification and deprecate `/api/auth/verify-email`.

### Tests
- Added route-level deprecation coverage:
  - `tests/auth/deprecated-verify-email-route.test.ts`

## 2026-03-02 (security closure: G2/G3/G5/G6/G7)

### Fixed
- Password reset completion audit now records the affected `userId`:
  - `app/api/auth/forgot-password/challenge/complete/route.ts`
  - `modules/auth/server/password-reset-challenge.ts` now returns `{ userId }` on successful completion
- Production environment validation now requires dedicated OTP pepper:
  - `lib/env/server.ts` enforces `AUTH_OTP_PEPPER` in production
  - prevents implicit fallback to `AUTH_SECRET` in hardened deployments

### Changed
- Audit schema and logger now support tenant-scoped forensics:
  - added nullable `tenantId` column + index to `AuditLog`
  - `logAudit(...)` accepts optional tenant context and persists it in first-class column
  - tenant access-denied/insufficient-role paths now pass tenant context explicitly
- `actorId` is no longer auto-mirrored from `userId`:
  - `actorId` is now explicit (`metadata.actorId`) to avoid redundant storage and keep actor/subject separation clear
- Added compound index for password-reset token lifecycle queries:
  - `PasswordResetToken`: `@@index([userId, expiresAt])`

### Added
- Migration:
  - `prisma/migrations/20260302095000_add_audit_tenant_and_password_reset_compound_index/migration.sql`

### Tests
- Updated audit log unit expectations for explicit actor/tenant columns:
  - `tests/auth/audit-log.test.ts`
- Updated password reset completion unit test for returned `userId`:
  - `tests/auth/password-reset-challenge.test.ts`

## 2026-03-02 (security closure: F1–F11 hardening batch)

### Fixed
- Closed host-header trust gap by tightening proxy host validation inputs:
  - `lib/security/request-guards.ts` now treats `Host` as authoritative input.
  - Added forwarded-host conflict detection and untrusted forwarded-host rejection in `proxy.ts`.
  - Updated nginx templates to always overwrite upstream `X-Forwarded-Host` with `$host`:
    - `ops/nginx/cloud.uppoint.com.tr.conf`
    - `ops/nginx/cloud.uppoint.com.tr.bootstrap.conf`
- Closed auth notification sync bottleneck with async outbox delivery:
  - Added `NotificationOutbox` schema/migration.
  - Added outbox service and batch dispatcher:
    - `modules/notifications/server/outbox.ts`
    - `app/api/internal/notifications/dispatch/route.ts`
  - Auth challenge flows now enqueue instead of direct provider send:
    - `modules/auth/server/login-challenge.ts`
    - `modules/auth/server/register-verification-challenge.ts`
    - `modules/auth/server/password-reset-challenge.ts`
  - Added dispatch cron/script:
    - `scripts/dispatch-notifications.sh`
    - `ops/cron/uppoint-notification-dispatch`
- Closed verify-email URL token leakage from querystring:
  - `modules/auth/components/verify-email-status.tsx` now removes `?token=` from browser URL after extraction.
- Closed audit visibility gap for edge rejections:
  - Added internal security-event ingest endpoint:
    - `app/api/internal/audit/security-event/route.ts`
  - `proxy.ts` now emits `edge_host_rejected` / `edge_origin_rejected` events (best effort).
  - Extended audit action union in `lib/audit-log.ts`.
- Closed root-script env execution risk:
  - Added safe key reader: `scripts/lib/env-reader.sh`.
  - Removed `.env` shell sourcing from privileged scripts:
    - `scripts/backup-db.sh`
    - `scripts/cleanup-db.sh`
    - `scripts/health-probe.sh`
    - `scripts/tune-system.sh`
- Closed API response contract drift on health route:
  - `app/api/health/route.ts` now uses standard `{ success, data|error }` envelope only.

### Changed
- Reduced authenticated-request DB pressure in JWT callback:
  - `auth.ts` now revalidates token/session state on a bounded interval (`AUTH_SESSION_REVALIDATE_SECONDS`, default `300`) instead of full DB checks on every callback cycle.
  - Added JWT `validatedAt` field (`types/next-auth.d.ts`).
- Remote smoke suite is now read-only by default:
  - `tests/e2e/auth-http-smoke.test.ts` gates mutating scenarios behind `E2E_ALLOW_MUTATIONS=1`.
  - `scripts/run-e2e-smoke-local.sh` defaults to `E2E_ALLOW_MUTATIONS=0`.
  - `.github/workflows/remote-auth-smoke.yml` explicitly sets read-only mode.
- Auth UI components were decomposed into smaller reusable parts to reduce coupling:
  - Added shared request utilities and extracted login/register/password-recovery subcomponents.
  - Line counts reduced:
    - `login-form.tsx`: `837 -> 753`
    - `register-form.tsx`: `698 -> 656`
    - `forgot-password-modal.tsx`: `646 -> 559`
- Nginx drift checker now supports explicit rate-limit policy modes:
  - `RATE_LIMIT_DRIFT_POLICY=warn|enforce-baseline|strict-template`
  - approved tuned baseline hash file support via `/etc/uppoint-cloud/uppoint-rate-limit.conf.sha256`
  - legacy `STRICT_RATE_LIMIT_TEMPLATE=1` remains compatible and maps to `strict-template`.

### Added
- New security/IP helper:
  - `lib/security/client-ip.ts`
- New tests:
  - `tests/security/client-ip.test.ts`
  - `tests/auth/notification-outbox.test.ts`
- New periodic nginx drift enforcement cron template:
  - `ops/cron/uppoint-nginx-drift-check` (`RATE_LIMIT_DRIFT_POLICY=enforce-baseline`)
- New fail-pattern based nginx drift alert scripts:
  - `scripts/run-nginx-drift-check.sh`
  - `scripts/alert-nginx-drift.sh`
  - supports Slack webhook + NotificationOutbox email alert channels

### Documentation
- Updated:
  - `README.md`
  - `ops/README.md`

## 2026-03-01 (hardening follow-up: deprecated auth routes, tenant selection safety, audit fallback sink)

### Fixed
- Closed legacy forgot-password endpoint contract drift by adding explicit routes:
  - `POST /api/auth/forgot-password/request` -> `410 ENDPOINT_DEPRECATED` JSON
  - `POST /api/auth/forgot-password/reset` -> `410 ENDPOINT_DEPRECATED` JSON
  - files:
    - `app/api/auth/forgot-password/request/route.ts`
    - `app/api/auth/forgot-password/reset/route.ts`
- Prevented ambiguous tenant fallback selection:
  - `resolveUserTenantContext` now requires explicit tenant selection when user has multiple memberships.
  - added `TENANT_SELECTION_REQUIRED` handling in dashboard UX/messages.
  - files:
    - `modules/tenant/server/user-tenant.ts`
    - `app/[locale]/dashboard/page.tsx`
    - `messages/tr.ts`
    - `messages/en.ts`
- Removed dead auth server paths to reduce maintenance/security drift:
  - deleted `modules/auth/server/authenticate-user.ts`
  - deleted `modules/auth/server/auth-notifications.ts`
  - deleted `tests/auth/authenticate-user.test.ts`

### Changed
- Edge fail-closed startup guard strengthened:
  - `proxy.ts` now throws in production when resolved host/origin allowlists are empty.
- Audit fallback improved with optional persistent JSONL sink:
  - `lib/audit-log.ts` writes redacted fallback events to `AUDIT_FALLBACK_LOG_PATH` (default `/var/log/uppoint-cloud/audit-fallback.log`) on DB write failures.
  - `lib/env/server.ts` accepts `AUDIT_FALLBACK_LOG_PATH`.
- Ops/service updates for audit fallback durability:
  - `ops/systemd/uppoint-cloud.service` now prepares `/var/log/uppoint-cloud` and allows write access.
  - `ops/logrotate/uppoint-cloud` now rotates `/var/log/uppoint-cloud/audit-fallback.log`.
- Nginx drift checker now tolerates auth burst-only divergence caused by runtime tuning:
  - `scripts/check-nginx-config-drift.sh`
- Script environment loading hardened by sourcing `.env` once instead of brittle grep/cut parsing:
  - `scripts/backup-db.sh`
  - `scripts/cleanup-db.sh`
  - `scripts/health-probe.sh`
- `scripts/tune-system.sh` now skips local PostgreSQL tuning by default for managed-DB deployments unless explicitly enabled.

### Tests
- Added deprecated-route unit coverage:
  - `tests/auth/deprecated-forgot-password-routes.test.ts`
- Extended e2e smoke coverage:
  - `tests/e2e/auth-http-smoke.test.ts` now verifies `410 ENDPOINT_DEPRECATED` behavior for legacy forgot-password endpoint.

### Documentation
- Updated:
  - `README.md`
  - `ops/README.md`

## 2026-03-01 (ci fix: move remote smoke workflow to repository root)

### Fixed
- Moved remote smoke workflow to repository root so GitHub Actions can discover and execute it:
  - from: `uppoint-cloud/.github/workflows/remote-auth-smoke.yml`
  - to: `.github/workflows/remote-auth-smoke.yml`
- Updated workflow execution context to run in `uppoint-cloud/` working directory.

### Documentation
- Updated workflow path references:
  - `README.md`
  - `AGENTS.md`

## 2026-03-01 (ci: nightly remote auth smoke workflow)

### Added
- Added GitHub Actions workflow:
  - `.github/workflows/remote-auth-smoke.yml`
- Workflow behavior:
  - nightly scheduled run (`00:15 UTC`)
  - manual `workflow_dispatch` support
  - executes `npm run test:e2e:remote` against remote base URL
  - supports optional `E2E_HEALTHCHECK_TOKEN` secret for protected health checks

### Documentation
- Updated `README.md` with workflow usage, schedule, and required optional CI settings.

## 2026-03-01 (remote smoke verification: cloud.uppoint.com.tr)

### Verification
- Remote auth smoke suite executed against deployed domain:
  - `E2E_BASE_URL=https://cloud.uppoint.com.tr npm run test:e2e:remote`
- Result:
  - `tests/e2e/auth-http-smoke.test.ts` passed (`4/4`)
  - localized login/register reachability passed
  - neutral unverified-email login behavior passed
  - register rate-limit behavior passed
  - forgot-password validation contract passed

## 2026-03-01 (test hardening: reduce audit fallback log noise)

### Changed
- Mocked `logAudit` in unit tests that intentionally run without DB access:
  - `tests/auth/user-lifecycle.test.ts`
  - `tests/tenant/tenant-scope.test.ts`
- This removes noisy fallback stderr output (`PrismaClientInitializationError`) while preserving functional assertions and deterministic test output.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

## 2026-03-01 (security closure: neutralized challenge errors + strict e2e origin guard compatibility)

### Changed
- Hardened idempotency subject fingerprinting in `lib/http/idempotency.ts`:
  - IP normalization now accepts only valid IP values (`net.isIP`), preventing arbitrary header strings from affecting replay scope.
- Neutralized challenge verification error surfaces (enumeration resistance):
  - `app/api/auth/register/challenge/verify-email/route.ts`
  - `app/api/auth/register/challenge/verify-sms/route.ts`
  - `app/api/auth/forgot-password/challenge/verify-email/route.ts`
  - `app/api/auth/forgot-password/challenge/verify-sms/route.ts`
  - internal specific errors (`INVALID_EMAIL_CODE`, `INVALID_SMS_CODE`) are now returned externally as the same neutral code path (`INVALID_OR_EXPIRED_CHALLENGE`) while preserving detailed audit reasoning.
- Strengthened local E2E runner production-guard compatibility:
  - `scripts/run-e2e-smoke-local.sh` now injects local `UPPOINT_ALLOWED_ORIGINS` (and canonical origin) in addition to hosts, so strict origin guard checks remain enabled during smoke tests.
- Updated tests for latest hardening behavior:
  - `tests/auth/password-reset-challenge.test.ts`
  - `tests/auth/rate-limit-fallback.test.ts`

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `npm run build`

## 2026-03-01 (security hardening: close R1-R16 except R11)

### Changed
- Expanded audit hardening in `lib/audit-log.ts`:
  - added PII-aware metadata redaction (email/phone/name class keys),
  - added structured `[audit-fallback]` sink for DB-write failures,
  - added structured `[security-signal]` emissions for alert-friendly security events.
- Removed raw email from register success audit metadata:
  - `app/api/auth/register/route.ts`
- Hardened health endpoint:
  - token comparison now uses `timingSafeEqual`,
  - response includes consistent envelope fields while preserving `status` compatibility.
  - file: `app/api/health/route.ts`
- Broadened edge origin guard from auth-only mutations to all `/api/*` mutations:
  - file: `proxy.ts`
- Reduced duplicate request-id response header behavior in production:
  - `proxy.ts` now defers canonical response header ownership to Nginx in production.
- Tenant boundary behavior updated:
  - removed implicit tenant auto-bootstrap from `resolveUserTenantContext`,
  - no-membership now throws explicit `TENANT_NOT_FOUND`,
  - dashboard now handles tenant-context errors with localized user-facing states,
  - tenant access denials/role insufficiency now audit-logged.
  - files:
    - `modules/tenant/server/user-tenant.ts`
    - `modules/tenant/server/scope.ts`
    - `app/[locale]/dashboard/page.tsx`
    - `messages/tr.ts`
    - `messages/en.ts`
- Soft-delete lifecycle consistency improved:
  - user soft-delete now removes tenant memberships and soft-deletes empty tenants.
  - file: `modules/auth/server/user-lifecycle.ts`
- Idempotency scoping strengthened:
  - added `subjectHash` context in idempotency records and lookup keying,
  - replay isolation now includes request-subject fingerprint (`ip + ua + session cookie`, or explicit `x-idempotency-scope`).
  - files:
    - `lib/http/idempotency.ts`
    - `prisma/schema.prisma`
    - `prisma/migrations/20260301230000_add_idempotency_subject_hash/migration.sql`
    - `tests/http/idempotency.test.ts`
- E2E smoke execution pipeline strengthened:
  - added local e2e runner script that boots app and runs smoke suite.
  - package scripts updated with `test:e2e`, `test:e2e:remote`, and `verify`.
  - files:
    - `scripts/run-e2e-smoke-local.sh`
    - `package.json`
- CSP hardening in Nginx templates:
  - removed `style-src 'unsafe-inline'`,
  - style nonce injection added via `sub_filter`.
  - files:
    - `ops/nginx/cloud.uppoint.com.tr.conf`
    - `ops/nginx/cloud.uppoint.com.tr.bootstrap.conf`
- Cron least-privilege/environment hardening:
  - `env -i`/strict PATH for cron jobs,
  - health probe executes script as `www-data` via `runuser` while keeping root-owned lock/log handling.
  - files:
    - `ops/cron/uppoint-health-probe`
    - `ops/cron/uppoint-postgres-backup`
    - `ops/cron/uppoint-db-cleanup`
    - `ops/cron/uppoint-redis-backup`
    - `ops/cron/uppoint-auth-rate-limit-tune`
- Documentation updates aligned with the above hardening:
  - `README.md`
  - `ops/README.md`

## 2026-03-01 (docs: correct AGENTS.md DATABASE_URL description)

### Changed
- Removed incorrect Prisma Accelerate description from `AGENTS.md` (lines 24–27).
  `DATABASE_URL` is a standard `postgresql://` URL — Accelerate is not in use.
  Backup/ops scripts can use `DATABASE_URL` directly with `psql`/`pg_dump`.

## 2026-03-01 (security: neutralize EMAIL_NOT_VERIFIED in email login-start response)

### Changed
- `POST /api/auth/login/challenge/email/start` no longer returns distinct `EMAIL_NOT_VERIFIED` error/status.
- For unverified accounts, endpoint now returns neutral success shape:
  - `200` with `{ success: true, data: { hasChallenge: false, challengeId: null, codeExpiresAt: null } }`
- Internal reason (`EMAIL_NOT_VERIFIED`) is still captured through audit logging.
- Updated e2e smoke expectation in `tests/e2e/auth-http-smoke.test.ts` for neutral response model.

## 2026-03-01 (auth follow-up: deletedAt index + verify-email zod body validation)

### Changed
- Added `@@index([deletedAt])` to `User` model in Prisma schema for soft-delete query performance.
- Added migration:
  - `prisma/migrations/20260301214000_add_user_deleted_at_index/migration.sql`
- Standardized `POST /api/auth/verify-email` body validation with Zod `safeParse`:
  - `token` now validated via schema (`trim`, `min(1)`, `max(512)`) instead of manual `typeof` checks.

## 2026-03-01 (Auth hardening: pending registration model + findings 2/3/4/5 closure)

### Changed
- Registration flow migrated to **pending challenge first** model:
  - `User` is no longer created at `/api/auth/register` start.
  - User creation now happens only after successful email OTP + SMS OTP completion.
  - Updated register restart flow to use `challengeId` instead of `userId`.
- `RegistrationVerificationChallenge` now stores pending registration payload (`email`, `name`, `phone`, `passwordHash`) and supports pre-user verification lifecycle.
- Added migration:
  - `prisma/migrations/20260301211000_pending_register_without_user/migration.sql`

### Security / Compliance
- Closed **finding #2** (`deletedAt` filter consistency):
  - `modules/auth/server/email-verification.ts`
  - `modules/auth/server/register-user.ts`
- Closed **finding #3** (dual-layer auth rate-limit on remaining routes):
  - `app/api/auth/verify-email/route.ts`
  - `app/api/auth/logout/route.ts`
  - `app/api/auth/forgot-password/request/route.ts`
  - `app/api/auth/forgot-password/reset/route.ts`
  - `app/api/auth/[...nextauth]/route.ts` (POST wrapper)
- Closed **finding #4** (validated env single entrypoint):
  - added `lib/env/index.ts`
  - switched env imports from `@/lib/env/server` to `@/lib/env`
- Closed **finding #5** (missing audit on unexpected auth errors):
  - `app/api/auth/login/challenge/email/verify/route.ts`
  - `app/api/auth/login/challenge/phone/verify/route.ts`
  - `app/api/auth/verify-email/route.ts`
  - `app/api/auth/register/route.ts`

### Tests
- Updated `tests/auth/register-verification-challenge.test.ts` for pending-registration lifecycle.

## 2026-03-01 (docs: align AGENTS.md with latest user-provided canonical policy text)

### Changed
- `AGENTS.md` updated to the exact latest policy wording provided by the project owner, including:
  - expanded Non-Negotiables and agent behavior rules,
  - tenant/isolation/startup validation requirements,
  - API/Server Action evolution and contract rules,
  - security/auth/logging/audit mandates,
  - background jobs, idempotency, backup/recovery, and Git discipline sections.

## 2026-03-01 (docs: AGENTS.md — restore comprehensive plain-text format with full Git discipline)

### Changed
- `AGENTS.md` rewritten to final definitive form: plain-text (no markdown ## headers), comprehensive ~700-line coverage of all rules, Non-Negotiables section near top, expanded Git discipline with Push requirements, Branch and history rules, and Safety rules subsections.

## 2026-03-01 (docs: refine AGENTS.md — consolidated structure, explicit agent discipline)

### Changed
- `AGENTS.md` refined: consolidated sections, merged quality/performance/database into one section, merged jobs/idempotency, caching/logging/audit; tightened wording throughout.

## 2026-03-01 (docs: update AGENTS.md — add agent behavior, tool discipline, startup validation, testing strategy, ask-vs-proceed rules)

### Changed
- `AGENTS.md` updated: added agent behavior rules, tool/change discipline, startup validation rules, testing strategy rules, and when-to-ask-vs-proceed guidance; existing sections refined.

## 2026-03-01 (Security categories 17 & 18: config/env guardrails + background job hardening)

### Changed
- `lib/env/server.ts` production fail-fast rules expanded:
  - `NEXT_PUBLIC_APP_URL` must use `https` in production.
  - `AUTH_TRUST_HOST=true` required in production.
  - `HEALTHCHECK_TOKEN` required in production.
  - Managed PostgreSQL production URLs must include `sslmode=require` (or `verify-full`) when DB host is non-local.
  - New optional envs: `UPPOINT_ALLOWED_HOSTS`, `UPPOINT_ALLOWED_ORIGINS`.
- `proxy.ts` now applies production request boundary checks:
  - invalid host headers rejected with `400 INVALID_HOST_HEADER`.
  - cross-origin auth mutations (`/api/auth/*`, non-GET/HEAD/OPTIONS) rejected with `403 ORIGIN_NOT_ALLOWED`.
  - matcher expanded to include `/api/auth/:path*` so edge guard is enforced on auth APIs too.
- New request guard utility:
  - `lib/security/request-guards.ts`
  - test coverage: `tests/security/request-guards.test.ts`

### Background jobs / ops hardening
- `scripts/backup-db.sh` and `scripts/backup-redis.sh` now produce `*.sha256` checksum sidecars.
- `scripts/restore-db.sh` and `scripts/restore-redis.sh` now verify checksums by default.
  - unsigned legacy backups require explicit `--allow-unsigned`.
- `scripts/cleanup-db.sh` now deletes expired `IdempotencyRecord` rows to prevent unbounded growth.

### Docs
- `README.md` and `ops/README.md` updated for:
  - new env security knobs,
  - host/origin edge-guard behavior,
  - checksum-verified restore workflow.

## 2026-03-01 (docs: rewrite AGENTS.md — production-grade instruction set)

### Changed
- `AGENTS.md` fully rewritten: condensed structure, added multi-tenant/authorization rules, background jobs, idempotency/concurrency, performance, backup/recovery, and architecture decision sections; integrated all prior security rules.

## 2026-03-01 (CSP nonce hardening + restore drill validation)

### Changed
- Nginx CSP policy migrated to nonce-based script protection:
  - `script-src` now uses per-request nonce (`$request_id`) with `strict-dynamic`.
  - Removed `unsafe-inline` from `script-src`.
  - `style-src` keeps `unsafe-inline` intentionally for framework-generated inline styles.
- Added nonce injection for HTML scripts via Nginx `sub_filter` in:
  - `ops/nginx/cloud.uppoint.com.tr.conf`
  - `ops/nginx/cloud.uppoint.com.tr.bootstrap.conf`
- Added `proxy_set_header Accept-Encoding ""` on page proxy locations so nonce injection is applied consistently.
- `scripts/check-nginx-config-drift.sh` updated to warn (not fail) for tuned `uppoint-rate-limit.conf` divergence unless `STRICT_RATE_LIMIT_TEMPLATE=1`.
- Updated E2E smoke coverage (`tests/e2e/auth-http-smoke.test.ts`) to verify CSP nonce behavior for HTTPS base URLs.
- Hardened E2E tolerance in shared environments by accepting controlled register throttle responses (`TOO_MANY_REQUESTS`) in non-201 branch.

### Ops verification
- Executed PostgreSQL restore drill on temporary database and validated restored row access.
- Executed non-disruptive Redis restore drill on temporary local Redis instance using backup archive.
- Updated `ops/README.md` with repeatable restore drill procedures.

## 2026-03-01 (docs: harden AGENTS.md with 10 rules derived from real security findings)

### Changed
- `AGENTS.md`: Added 10 engineering rules across 5 sections based on security bugs encountered in this project:
  - **Architecture rules**: tenant isolation enforcement (`assertTenantAccess()` mandatory in every handler), route protection checklist (`PROTECTED_ROUTES` as single source of truth)
  - **Security rules**: raw token storage prohibition (hash-in-DB, raw-in-email), `timingSafeEqual` mandatory for token comparison, HMAC-SHA256+pepper for OTP hashing, dual rate-limit layers (IP + identifier), account enumeration neutrality, fail-closed infrastructure failure requirement
  - **Error handling rules**: `logAudit()` mandatory for every state-changing auth operation, action types must be added to `AuditAction` union
  - **Database rules**: `where: { deletedAt: null }` mandatory on soft-delete models, new time-bounded tables must have cleanup entries in `scripts/cleanup-db.sh`
  - **Testing rules**: cryptographic test mocks must use valid 64-char hex strings, not human-readable placeholders

## 2026-03-01 (Security closure batch: soft-delete enforcement, tenant bootstrap, idempotency, ops hardening)

### Changed
- Auth queries now consistently enforce active users only (`deletedAt: null`) in:
  - `modules/auth/server/authenticate-user.ts`
  - `modules/auth/server/login-challenge.ts`
  - `modules/auth/server/password-reset-challenge.ts`
  - `modules/auth/server/register-verification-challenge.ts`
  - `auth.ts` JWT refresh path
- Failed password attempt updates switched to atomic SQL increment in `login-challenge.ts` to reduce race-condition risk.
- Login token consumption rejects soft-deleted users before issuing sessions.
- Register verification completion now bootstraps tenant + owner membership when missing.
- Dashboard now resolves server-side tenant context via `modules/tenant/server/user-tenant.ts`.
- Added idempotency persistence (`IdempotencyRecord`) and wrapped auth challenge/start/verify routes with `withIdempotency(...)`.
- Added unified `GET` 405 handlers for POST-only auth routes with explicit `Allow: POST`.
- Verify-email link now places token in URL fragment (`#token=...`) to reduce token leakage via logs/referrer.
- Proxy/Nginx now propagate `X-Request-Id` end-to-end for correlation.
- `next.config.ts` now disables `X-Powered-By` header.
- Ops cron jobs now use `flock` lock files to avoid concurrent run overlap.
- `scripts/health-probe.sh` now targets `/api/health` directly and supports `.env` token loading.
- Build scripts split:
  - `build` => `next build`
  - `build:deploy` => `next build && npm run service:restart`

### Added
- `modules/auth/server/user-lifecycle.ts`: transactional soft-delete lifecycle with session/token/challenge invalidation.
- `tests/auth/user-lifecycle.test.ts`: soft-delete lifecycle coverage.
- `modules/tenant/server/user-tenant.ts`: tenant context resolver + bootstrap fallback.
- `tests/tenant/user-tenant.test.ts`: tenant context and access-denied coverage.
- `lib/http/idempotency.ts`: request header based idempotency cache/replay helper.
- `prisma/migrations/20260301193000_add_idempotency_records/`: DB migration for idempotency table.
- `scripts/restore-db.sh` and `scripts/restore-redis.sh`: guarded restore with pre-restore snapshots.
- `scripts/check-nginx-config-drift.sh`: deployed-vs-repo config drift detection.

### Docs
- `README.md` and `ops/README.md` updated to:
  - remove deleted `password-reset.ts` reference
  - reflect `build` vs `build:deploy` behavior
  - document restore/drift-check operations
  - include `AUDIT_LOG_RETENTION_DAYS` env variable

## 2026-03-01 (Security: callbackUrl redirect fix + RevokedSessionToken cleanup + audit)

### Security
- **callbackUrl open redirect kapatıldı**: `login-form.tsx`'te URL parametresinden gelen `callbackUrl` artık yalnızca `/` ile başlıyorsa kabul ediliyor; harici domain'e redirect engellenmiş.
- **RevokedSessionToken scheduled cleanup**: `scripts/cleanup-db.sh`'e süresi dolmuş JTI blacklist kayıtlarını temizleyen adım eklendi (8. tablo). Önceden yalnızca lazy cleanup vardı; pasif token'lar tablo şişmesine yol açabilirdi.

### Fixed
- `proxy.ts`'in Next.js 16'nın resmi proxy/middleware dosyası olduğu doğrulandı (`PROXY_FILENAME = 'proxy'`). Build çıktısında "ƒ Proxy (Middleware)" ile teyit edildi; edge auth aktif.
- `scripts/health-probe.sh` nginx `/healthz` snippet'ı üzerinden token inject ettiği doğrulandı; probe script'e ek değişiklik gerekmedi.

## 2026-03-01 (Security + architecture closure batch: remaining findings 1-16)

### Changed
- **JWT revoke/blacklist hardening**:
  - `RevokedSessionToken` modeli eklendi ve logout sırasında `sessionJti` revoke akışı bağlandı.
  - `auth.ts` JWT callback, revoke listesine düşen oturumları otomatik geçersiz sayacak şekilde güncellendi.
- **OTP hashing hardening**:
  - OTP hash üretimi HMAC tabanlı hale getirildi (`AUTH_OTP_PEPPER` / `AUTH_SECRET` fallback).
- **Account lockout policy**:
  - Login başlangıcında kilitli hesap kontrolü eklendi.
  - Hatalı parola denemeleri `failedLoginAttempts/lockedUntil` alanlarıyla takip edilip 15 dk kilitleme uygulanıyor.
- **Tenant/RBAC foundation**:
  - `Tenant` + `TenantMembership` modelleri ve `TenantRole` enum’u eklendi.
  - Tenant erişim/rol doğrulaması için `modules/tenant/server/scope.ts` eklendi.
- **Managed PostgreSQL script compatibility**:
  - `scripts/backup-db.sh` ve `scripts/cleanup-db.sh` artık `.env` dosyasını source etmek yerine yalnız `DATABASE_URL` satırını güvenli parse ediyor.
  - Özel karakter içeren `.env` satırları script kırılmasına neden olmuyor.
- **E2E health smoke fix**:
  - `tests/e2e/auth-http-smoke.test.ts` production `HEALTHCHECK_TOKEN` davranışını (401/200) destekleyecek şekilde güncellendi.
- **Audit schema standardization**:
  - `AuditLog` alanları genişletildi: `actorId`, `targetId`, `result`, `reason`, `requestId`, `userAgent`, `forwardedFor`.
  - `lib/audit-log.ts` bu alanları otomatik normalize edip dolduruyor.
- **Audit immutability (DB-level)**:
  - `AuditLog` satırlarını update etmeyi engelleyen PostgreSQL trigger eklendi.
- **CSP tightening**:
  - Nginx CSP policy stricter direktiflerle güncellendi (`object-src 'none'`, `frame-ancestors 'none'`, `worker-src`, `manifest-src`, vb.).
  - `X-Frame-Options` `DENY` olarak sertleştirildi.
- **Ops docs consistency**:
  - `ops/README.md` environment dosya yolu `EnvironmentFile=/opt/uppoint-cloud/.env` ile senkronize edildi.
- **DB cron automation completion**:
  - `ops/cron/uppoint-postgres-backup` ve `ops/cron/uppoint-db-cleanup` eklendi.
  - `ops/logrotate/uppoint-cloud` PostgreSQL backup ve cleanup log dosyalarını kapsayacak şekilde güncellendi.
- **Logout invalidation polish**:
  - `modules/auth/client/logout.ts` ile tüm logout giriş noktaları tekleştirildi.
  - Session timeout uyarısı dahil tüm sign-out akışları önce `/api/auth/logout` (revoke/audit), sonra `signOut` çalıştırıyor.
- **Route protection extensibility**:
  - `modules/auth/server/route-access.ts` route-policy yapısı genişletilebilir hale getirildi.
  - Callback URL korunacak korumalı rotalar merkezi yapıdan yönetiliyor.
- **Rate-limit fallback growth control**:
  - Prisma fallback cleanup, olasılıksal (%1) modelden deterministik ve interval-throttled modele geçirildi.
- **Locale-aware global errors**:
  - `app/global-error.tsx`, `app/not-found.tsx`, `app/[locale]/error.tsx` TR/EN locale algısına göre metin üretiyor.
  - `modules/i18n/error-messages.ts` eklendi.
- **Dead zero-byte file cleanup**:
  - Kullanılmayan boş dosyalar kaldırıldı:
    - `components/shared/app-header.tsx`
    - `modules/auth/components/forgot-password-request-form.tsx`
    - `modules/auth/components/reset-password-form.tsx`

### Added
- Testler:
  - `tests/auth/session-revocation.test.ts`
  - `tests/auth/otp-hash.test.ts`
  - `tests/tenant/tenant-scope.test.ts`
  - `tests/auth/audit-log.test.ts`
  - `tests/auth/logout-client.test.ts`
  - `tests/auth/rate-limit-fallback.test.ts`
  - `tests/i18n/error-messages.test.ts`

## 2026-03-01 (Security re-audit: logout rate limiting)

### Changed
- `app/api/auth/logout/route.ts`: rate limiting eklendi (20 istek/dakika per IP) — flood saldırılarında DB baskısı engelleniyor, `rate_limit_exceeded` audit logu eklendi.

## 2026-03-01 (Security audit kapsamı: timing attack, plaintext token, enumeration, infra hardening)

### Added
- `middleware.ts` kaldırıldı — Next.js 16'da yerini `proxy.ts` aldığı için artık geçersizdi; `proxy.ts` zaten edge auth koruması sağlıyor.
- `ops/postgresql/98-uppoint-static.conf` oluşturuldu:
  - `statement_timeout=30s`, `idle_in_transaction_session_timeout=30s`, `lock_timeout=10s`.
  - Live: `/etc/postgresql/17/main/conf.d/98-uppoint-static.conf` olarak deploy edildi, `systemctl reload postgresql` ile uygulandı.
- `prisma/migrations/20260301160000_add_user_security_fields/migration.sql`:
  - `User` modeline `failedLoginAttempts`, `lockedUntil`, `lastLoginAt`, `deletedAt` alanları eklendi.

### Changed
- `modules/auth/server/email-verification.ts`:
  - **[Critical Fix]** Email doğrulama token'ı artık DB'ye plaintext değil SHA-256 hash olarak yazılıyor; URL'de raw token gönderilip doğrulama sırasında hashlenip eşleştiriliyor. DB sızıntısında aktif token'lar artık kullanılamaz.
- `modules/auth/server/login-challenge.ts`, `password-reset-challenge.ts`, `register-verification-challenge.ts`:
  - **[Critical Fix]** OTP/token hash karşılaştırmalarında `!==` yerine `crypto.timingSafeEqual()` kullanılıyor (6 lokasyon). Timing side-channel saldırıları engelleniyor.
- `lib/audit-log.ts`:
  - `forwardedFor` IP extraction düzeltildi: `split(",")[0]` (leftmost/saldırgan kontrolünde) yerine `X-Real-IP` öncelikli, rightmost XFF fallback.
  - Metadata redaction genişletildi: key bazlı kontrol yanında değer bazlı tarama eklendi (bearer token, JWT prefix, `password=` pattern'ları redact).
  - `password_changed` ve `session_revoked` action type'ları eklendi.
- `app/api/auth/login/challenge/phone/start/route.ts`:
  - **[High Fix]** `EMAIL_NOT_VERIFIED` durumunda artık 403 yerine 200 + `{ hasChallenge: false }` dönüyor. Hesap varlığı enumeration'ı önleniyor.
- `ops/systemd/uppoint-cloud.service` + `/etc/systemd/system/uppoint-cloud.service`:
  - `LimitNOFILE=65536`, `CPUQuota=400%`, `TasksMax=512` eklendi. `systemctl daemon-reload` uygulandı.
- `ops/nginx/uppoint-rate-limit.conf`:
  - `rate=30r/m` → `rate=20r/m` (live config ile senkronize edildi).
- `ops/nginx/cloud.uppoint.com.tr.conf`:
  - `burst=20` → `burst=17` (live config ile senkronize edildi).
- `prisma/schema.prisma`:
  - `User` modeline `failedLoginAttempts Int @default(0)`, `lockedUntil DateTime?`, `lastLoginAt DateTime?`, `deletedAt DateTime?` alanları eklendi.
- `tests/auth/password-reset-challenge.test.ts`, `tests/auth/register-verification-challenge.test.ts`:
  - `timingSafeEqual` için mock hash'ler geçerli 64-char hex string'e güncellendi (`"a".repeat(64)` / `"b".repeat(64)`).

## 2026-03-01 (Auth security hardening: token revocation, atomic challenge consumption, limiter trust fixes)

### Added
- `prisma/schema.prisma`:
  - `User.tokenVersion` alanı eklendi (`@default(0)`) ve migration oluşturuldu:
    - `prisma/migrations/20260301150000_add_user_token_version/migration.sql`
- `app/api/auth/logout/route.ts` eklendi:
  - logout olayı için server-side audit kayıt noktası.
- `modules/auth/components/verify-email-status.tsx` eklendi:
  - e-posta doğrulama işlemini client-side POST akışına taşıyan durum bileşeni.

### Changed
- `auth.ts`:
  - JWT callback’inde `tokenVersion` kontrolü eklendi.
  - güvenlik kritik durumlarda revize edilen kullanıcı sürümü ile token sürümü uyuşmazsa oturum düşürülüyor.
- `modules/auth/server/login-challenge.ts`:
  - login OTP doğrulama ve login token tüketimi atomik hale getirildi (conditional update).
  - consume edilen kullanıcıya `tokenVersion` taşınıyor.
- `modules/auth/server/register-verification-challenge.ts`:
  - register email/SMS challenge doğrulamaları atomik tüketim modeline alındı.
- `modules/auth/server/password-reset-challenge.ts` ve `modules/auth/server/password-reset.ts`:
  - reset token/challenge tüketimi atomik hale getirildi.
  - parola değişiminde `User.tokenVersion` artırılarak eski JWT’lerin geçersiz kalması sağlandı.
- `lib/rate-limit.ts`:
  - IP çözümlemesi `X-Real-IP` öncelikli ve güvenli `X-Forwarded-For` parse (right-most trusted).
  - auth limiter backend hatasında fail-open yerine fail-closed davranışa geçildi.
  - identifier bazlı ikinci katman limit fonksiyonu eklendi.
- Auth API route’larında (`login/register/forgot-password`):
  - limiter aşımlarında audit log eklendi.
  - email/phone/user bazlı identifier rate-limit katmanı eklendi.
- `app/[locale]/verify-email/page.tsx` + `app/api/auth/verify-email/route.ts`:
  - doğrulama route’u POST akışıyla çalışacak şekilde güncellendi.
  - `GET /api/auth/verify-email` artık mutasyon yapmaz (`405 METHOD_NOT_ALLOWED`).
- `app/api/health/route.ts`:
  - health response sadeleştirildi, production’da opsiyonel `HEALTHCHECK_TOKEN` doğrulaması eklendi.
- `scripts/backup-db.sh` ve `scripts/backup-redis.sh`:
  - `umask 077` + backup dizin/dosya izin sertleştirmesi eklendi.
- Ops health monitoring:
  - `scripts/sync-healthcheck-token-to-nginx.sh` eklendi (`.env` -> Nginx snippet senkronu ve reload).
  - `scripts/health-probe.sh` eklendi (local tokenized `/healthz` probe).
  - `ops/cron/uppoint-health-probe` ve logrotate kapsamı eklendi.
- `lib/audit-log.ts`:
  - audit metadata’ya otomatik `requestId`, `userAgent`, `forwardedFor` bağlamı eklendi.
  - metadata anahtarlarında hassas alanlar (`password|token|secret|authorization|cookie`) redakte edilir hale getirildi.
- Auth verify route’larında:
  - challengeId bazlı identifier limiter katmanı eklendi (`login/register/forgot-password verify` + `forgot-password complete`).
- `README.md`:
  - yeni güvenlik akışları, health token ve deprecate edilen reset endpoint’leri belgelendi.

### Fixed
- Auth rate-limit bypass riski (spoofed `X-Forwarded-For`) azaltıldı.
- Login/reset/register doğrulama adımlarında replay/race pencereleri daraltıldı.
- JWT oturum iptali için parola sıfırlama sonrası etkisiz kalan eski token problemi giderildi.
- Legacy password reset endpoint saldırı yüzeyi azaltıldı (`410 ENDPOINT_DEPRECATED`).
- State-changing verify-email GET riski kaldırıldı (POST-only mutation).

## 2026-03-01 (Verification code input redesign: underlined 6-digit slots)

### Changed
- `modules/auth/components/verification-code-input.tsx` altı çizgili 6 hane slot tasarımına geçirildi.
- Kod alanı artık tüm auth akışlarında aynı görsel standardı kullanıyor:
  - login OTP
  - register e-posta/SMS doğrulama
  - şifre sıfırlama e-posta/SMS doğrulama
- Giriş sadece numerik (`0-9`) ve maksimum 6 hane olacak şekilde korunmaya devam ediyor.

## 2026-03-01 (Register verification SMS delivery fix + clearer error mapping)

### Fixed
- Register e-posta kodu doğrulama sonrası SMS gönderim hatası (`401 Eksik kullanıcı adı/şifre`) için provider uyumluluk ayarı etkinleştirildi:
  - `.env`: `UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS=true`
- `modules/auth/server/register-verification-challenge.ts`:
  - SMS gönderim hatası artık `SMS_DELIVERY_FAILED` olarak kontrollü şekilde sınıflandırılıyor.
- `app/api/auth/register/challenge/verify-email/route.ts`:
  - `SMS_DELIVERY_FAILED` kodu API cevabına yansıtılıyor.
- `modules/auth/components/register-form.tsx` ve sözlükler:
  - Bu durum için kullanıcıya daha net hata mesajı gösteriliyor (TR/EN).

## 2026-03-01 (Unified 6-digit verification input style)

### Changed
- `modules/auth/components/verification-code-input.tsx` eklendi:
  - 6 haneli doğrulama kodu için tek satır, sade ve placeholder tabanlı ortak input bileşeni.
  - Sadece rakam kabul eder (`0-9`) ve değeri 6 hane ile sınırlar.
- Aşağıdaki ekranlarda kod alanları ortak bileşene taşındı:
  - `modules/auth/components/login-form.tsx` (e-posta OTP + telefon OTP)
  - `modules/auth/components/register-form.tsx` (kayıt e-posta kodu + SMS kodu)
  - `modules/auth/components/forgot-password-modal.tsx` (e-posta kodu + SMS kodu)

## 2026-03-01 (Register OTP verification flow: email + SMS, 3-minute sequential steps)

### Added
- `modules/auth/server/register-verification-challenge.ts`:
  - Register sonrası e-posta kodu (3 dk) üretim/gönderim
  - E-posta kodu doğrulama sonrası SMS kodu (3 dk) üretim/gönderim
  - SMS kodu doğrulama sonrası kullanıcı doğrulama tamamlama (`emailVerified`, `phoneVerifiedAt`)
- Yeni API route'ları:
  - `POST /api/auth/register/challenge/verify-email`
  - `POST /api/auth/register/challenge/verify-sms`
  - `POST /api/auth/register/challenge/restart`
- Yeni test dosyası:
  - `tests/auth/register-verification-challenge.test.ts`
- Prisma schema güncellendi:
  - `User.phoneVerifiedAt`
  - `RegistrationVerificationChallenge` modeli
  - Migration: `20260301103939_add_register_verification_challenge`

### Changed
- `app/api/auth/register/route.ts` artık doğrulama linki yerine register challenge başlatır ve `challengeId + emailCodeExpiresAt` döner.
- Register sırasında challenge başlatma başarısız olursa oluşturulan kullanıcı için best-effort rollback uygulanır.
- `EMAIL_TAKEN` durumunda, doğrulaması tamamlanmamış hesap için verification flow yeniden başlatılabilir.
- `modules/auth/components/register-form.tsx` akışı güncellendi:
  - adım 1: hesap bilgileri
  - adım 2: e-posta kodu doğrulama (3 dk sayaç)
  - adım 3: SMS kodu doğrulama (3 dk sayaç)
  - süre dolduğunda `Yeni kod gönder` ile akış yeniden başlatma
- `messages/tr.ts` ve `messages/en.ts` register sözlükleri yeni OTP adımlarına göre genişletildi.
- `scripts/cleanup-db.sh` içine `RegistrationVerificationChallenge` temizlik adımı eklendi.
- `README.md` auth milestone açıklaması register OTP akışını yansıtacak şekilde güncellendi.

## 2026-03-01 (Register success state persistence fix)

### Fixed
- Kayıt sonrası başarı adımında `router.refresh()` kaldırıldı.
- Böylece e-posta doğrulama bilgilendirme popup/kartı kullanıcı manuel ilerleyene kadar açık kalır; otomatik kapanma/step reset engellendi.

## 2026-03-01 (Register success notice copy update)

### Changed
- Kayıt sonrası başarı bildirimi metni TR/EN için kurumsal ve aksiyon odaklı hale getirildi:
  - Başlık artık e-posta doğrulama gerekliliğini doğrudan ifade ediyor.
  - Açıklama metni, devam etmeden önce doğrulama bağlantısının onaylanması gerektiğini netleştiriyor.

## 2026-03-01 (Email verification URL canonical host fix)

### Fixed
- Register sonrası gönderilen e-posta doğrulama linki artık request origin yerine canonical `NEXT_PUBLIC_APP_URL` tabanından üretiliyor.
- Böylece ters proxy / internal host senaryolarında `https://localhost:3000/...` link üretilmesi engellendi.
- `modules/auth/server/email-verification.ts` locale’i `tr/en` whitelist ile normalize ediyor (`defaultLocale` fallback).

## 2026-03-01 (Auth rate-limit auto tuning + traffic report)

### Added
- `scripts/tune-auth-rate-limit.sh` eklendi:
  - Nginx access log üzerinden `/api/auth/*` trafik analizi yapar
  - `p95 per-ip/per-minute` + `429 oranı` metriklerine göre önerilen `rate/burst` hesaplar
  - Markdown + JSON raporu üretir (`/var/log/uppoint-cloud/auth-rate-limit/`)
  - `--apply` modunda Nginx config güncellemesi yapar, `nginx -t` başarısız olursa otomatik rollback uygular
- `ops/cron/uppoint-auth-rate-limit-tune` cron şablonu eklendi (30 dakikada bir güvenli tuning + rapor).
- `ops/logrotate/uppoint-cloud` şablonu eklendi:
  - `/var/log/uppoint-auth-rate-limit-tune.log` günlük rotate (30 gün saklama)
  - backup ve PostgreSQL log kurallarıyla birlikte tek şablonda yönetim
  - `su root adm` ile `/var/log` insecure-permission skip davranışı giderildi

### Changed
- `ops/README.md` içerisine auth rate-limit tuning runbook’u eklendi:
  - manuel rapor üretimi
  - apply modu
  - cron kurulum adımları
  - rollback davranışı ve rapor lokasyonları
- `ops/README.md` logrotate kurulumu ve doğrulama adımlarıyla güncellendi.

## 2026-03-01 (Local Redis + Nginx/Fail2ban hardening bundle)

### Added
- Sunucuya `redis-server` (v7.0.15) + `redis-tools` kuruldu, systemd altında etkinleştirildi (`redis-server.service`).
- `lib/env/server.ts`: `RATE_LIMIT_REDIS_URL` environment variable eklendi (opsiyonel).
- `package.json`: `redis` npm dependency eklendi.
- `scripts/backup-redis.sh`: Redis persistence dosyaları (`dump.rdb` + `appendonlydir`) için günlük backup scripti.
- `ops/redis/99-uppoint-cloud.conf`: Redis hardening örnek konfigürasyonu.
- `ops/nginx/uppoint-rate-limit.conf`: Auth API `limit_req_zone` konfigürasyonu.
- `ops/fail2ban/nginx-uppoint-auth.conf` + `ops/fail2ban/uppoint-auth.local`: Auth 429 pattern jail/filter dosyaları.
- `ops/cron/uppoint-redis-backup`: günlük Redis backup cron şablonu.

### Changed
- `lib/rate-limit.ts` backend önceliği güncellendi:
  1. Local Redis (`RATE_LIMIT_REDIS_URL`)
  2. Upstash (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
  3. Prisma fallback
- Local Redis için atomic sliding-window algoritması (Lua + sorted set) eklendi.
- Redis hardening runtime ayarları uygulandı:
  - `appendonly yes`
  - `appendfsync everysec`
  - `maxmemory 256mb`
  - `maxmemory-policy volatile-ttl`
- Nginx auth route katmanında edge throttling eklendi (`/api/auth/*`, zone `uppoint_auth_per_ip`, 30r/m + burst 20).
- Fail2ban tarafında `nginx-uppoint-auth` jail aktif edildi (access.log üzerinde `/api/auth/*` + `429` eşleşmesi).
- Redis backup cron gerçek sisteme yazıldı: `/etc/cron.d/uppoint-redis-backup`.
- Logrotate kuralına `/var/log/uppoint-redis-backup.log` eklendi.
- `.env` yerel çalışma için `RATE_LIMIT_REDIS_URL=redis://127.0.0.1:6379` ile güncellendi (repo dışı operasyonel dosya).
- `README.md` + `ops/README.md` rate-limit backend önceliği, maxmemory açıklaması ve hardening runbook’u güncellendi.

### Verification
- `redis-cli ping` -> `PONG`
- `systemctl is-active redis-server` -> `active`
- `redis-cli CONFIG GET appendonly maxmemory maxmemory-policy appendfsync` -> beklenen değerler doğrulandı
- `nginx -t` + `systemctl reload nginx` -> ✓
- `fail2ban-client status nginx-uppoint-auth` -> ✓
- `/opt/uppoint-cloud/scripts/backup-redis.sh` manuel çalıştırma -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run test:e2e` -> ✓
- `npm run build` -> ✓ (`uppoint-cloud.service` restarted)
- Runtime check: aynı IP ile 6. register isteğinde `429 TOO_MANY_REQUESTS`, Redis key oluştu ve `RateLimitAttempt` DB satırı artmadı (`0 -> 0`).

## 2026-03-01 (Proxy geri dönüşü + backup tracking temizliği + auth E2E smoke)

### Changed
- **Next.js konvansiyonu uyumu**:
  - `middleware.ts` yerine tekrar `proxy.ts` kullanıldı.
  - Edge route guard mantığı korunarak file naming Next.js 16 önerisine geri alındı.
- **Repo hygiene (backup artifacts)**:
  - `/opt/backups` repo takibinden çıkarıldı (`git rm --cached`), dosyalar sunucuda tutulmaya devam ediyor.
  - Kök depoya `.gitignore` eklendi ve `backups/` ignore edildi.
- **Dokümantasyon güncellemesi**:
  - `README.md` route protection referansı tekrar `proxy.ts` olarak güncellendi.
  - Upstash rate limit aktivasyon/doğrulama notları eklendi.

### Added
- **Auth HTTP E2E smoke test suite**:
  - `tests/e2e/auth-http-smoke.test.ts`
  - Canlı endpoint smoke kapsamı:
    - `/tr/login` ve `/tr/register` erişilebilirlik
    - Unverified kullanıcı için `EMAIL_NOT_VERIFIED` (403) davranışı
    - Register route IP rate-limit (429)
    - Forgot-password challenge validation contract (400/`VALIDATION_FAILED`)
- `package.json` script:
  - `npm run test:e2e` (`RUN_E2E=1 vitest run tests/e2e --testTimeout=30000`)

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run test:e2e` -> ✓
- `npm run build` -> ✓ (`uppoint-cloud.service` restarted)

## 2026-03-01 (Middleware standardizasyonu — proxy.ts -> middleware.ts)

### Changed
- Edge route koruma dosyası Next.js standart adıyla güncellendi:
  - `proxy.ts` kaldırıldı
  - Aynı JWT + locale + callbackUrl koruma mantığı `middleware.ts` dosyasına taşındı
- Dokümantasyon referansı güncellendi:
  - `README.md` route protection referansı `middleware.ts` olarak değiştirildi

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓ (`uppoint-cloud.service` restarted)

## 2026-03-01 (Auth hardening batch — remaining security findings closure)

### Changed
- **Rate limiting backend hardened**:
  - `lib/rate-limit.ts` now supports Upstash Redis (`@upstash/redis` + `@upstash/ratelimit`) sliding-window IP limits.
  - Automatic fallback to existing Prisma-backed limiter preserved for continuity when Upstash env vars are absent.
  - 429 responses now include `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Window-Seconds`.
- **Environment validation tightened**:
  - Added optional `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair validation.
  - Added `UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS` (default `false`) for explicit legacy SMS compatibility.
  - Enforced `UPPOINT_EMAIL_USE_TLS=true` in production when SMTP backend is enabled.
- **Email verification enforced on sign-in**:
  - `modules/auth/server/login-challenge.ts` now rejects login challenge start when `emailVerified` is null.
  - New auth error code: `EMAIL_NOT_VERIFIED`.
  - Login API routes return `403` for this case and add audit trail entries.
- **Audit logging coverage expanded**:
  - Added failure logging for login challenge start failures (email/phone start).
  - Added failure logging for forgot-password challenge steps (`start`, `verify_email`, `verify_sms`, `complete`).
- **Transport security improvements**:
  - `modules/auth/server/sms-service.ts` now uses `Authorization: Basic ...` header for provider credentials (body credentials disabled by default).
  - SMS requests now include a 15s timeout.
  - `modules/auth/server/email-service.ts` now enforces TLS by environment policy and adds SMTP connection/greeting/socket timeouts.
- **Register flow clarity**:
  - Removed invalid auto sign-in attempt from register success flow.
  - Success action now redirects users to login with prefilled email query.
  - TR/EN register success CTA text updated to match actual flow.

### Added
- `tests/auth/login-challenge.test.ts`: explicit test for unverified email login rejection (`EMAIL_NOT_VERIFIED`).

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> 30/30 ✓
- `npm run build` -> ✓ (`uppoint-cloud.service` restarted)

## 2026-03-01 (Sistem geneli optimizasyon — swappiness, nginx gzip/tcp, PG autovacuum)

### Changed
- **`scripts/tune-system.sh`** güncellendi:
  - Disk tipi tespiti (SSD/HDD) → `random_page_cost` ve `effective_io_concurrency` otomatik
  - `max_connections` formül bazlı (RAM/100, [100–300]); `work_mem` buna göre hesaplanıyor
  - PostgreSQL `autovacuum_naptime=20s`, `vacuum_scale_factor`, `analyze_scale_factor` eklendi
  - Kernel: `vm.swappiness=10` (varsayılan 60), `vm.dirty_ratio=15`, `vm.dirty_background_ratio=5`, `tcp_tw_reuse=1`
- **Nginx global** (`/etc/nginx/nginx.conf`): `tcp_nodelay on`, `server_tokens off`, `keepalive_timeout 25s`, tam gzip parametreleri etkinleştirildi
- **Nginx site config**: `client_body_buffer_size 128k`, `proxy_buffer_size 16k`, `proxy_buffers 16 16k` eklendi

## 2026-03-01 (Otomatik donanım tabanlı performans ayarlama sistemi)

### Added
- **`scripts/tune-system.sh`**: Tüm bileşenleri sunucunun RAM ve CPU sayısına göre otomatik ayarlayan tek script:
  - **PostgreSQL** → `/etc/postgresql/17/main/conf.d/99-uppoint-tuned.conf` (shared_buffers=RAM/4, effective_cache_size=RAM×0.75, work_mem, maintenance_work_mem, wal_buffers)
  - **Node.js heap** → `/etc/uppoint-cloud-tuned.env` (`NODE_OPTIONS=--max-old-space-size=N`, MemoryMax'ın %75'i)
  - **Kernel ağ parametreleri** → `/etc/sysctl.d/99-uppoint-tuned.conf` (somaxconn=1024, netdev_max_backlog=5000, tcp_fin_timeout=30, fs.file-max=1000000)
  - **Nginx worker_connections** → CPU×1024 olacak şekilde `nginx.conf` güncellenir
- **`ops/systemd/uppoint-tune.service`**: Önyükleme sırasında `tune-system.sh`'ı otomatik çalıştıran oneshot systemd servisi. `uppoint-cloud.service`'den önce tamamlanır.
- **`ops/systemd/uppoint-cloud.service`**: `MemoryMax=20%` (yüzde sözdizimi — RAM yükseltilince otomatik ölçeklenir), `EnvironmentFile=-/etc/uppoint-cloud-tuned.env` (NODE_OPTIONS), `Wants=uppoint-tune.service` eklendi.

### Changed
- PostgreSQL'in donanıma bağlı ayarları (shared_buffers vb.) artık sabit değer yerine `conf.d/99-uppoint-tuned.conf` üzerinden yönetilir. Bir dahaki RAM yükseltmesinde `sudo bash scripts/tune-system.sh` komutu yeterlidir.

## 2026-03-01 (Production hazırlık — hata sayfaları, sağlık endpoint, nginx & systemd sertleştirme)

### Added
- **`app/global-error.tsx`**: Root layout hataları için global error boundary (kendi `<html>/<body>` içeriyor).
- **`app/[locale]/error.tsx`**: Locale sayfalarındaki runtime hatalar için error boundary — "Tekrar dene" + ana sayfa linki.
- **`app/not-found.tsx`**: Global 404 sayfası — türkçe mesaj + ana sayfa yönlendirme.
- **`app/[locale]/dashboard/loading.tsx`**: Dashboard RSC streaming için loading skeleton (spinner).
- **`app/api/health/route.ts`**: Sağlık kontrol endpoint'i — DB erişilebilirse `200 { status: "ok" }`, değilse `503` döner. Monitoring ve load balancer probe'ları için.
- **`ops/nginx/cloud.uppoint.com.tr.conf`**: Gzip sıkıştırma (`gzip on; comp_level 6`) — JSON, JS, CSS, SVG dahil.
- **`ops/nginx/cloud.uppoint.com.tr.conf`**: `Content-Security-Policy` header eklendi (`default-src 'self'`, inline script/style, frame-ancestors 'self').
- **`ops/nginx/cloud.uppoint.com.tr.conf`**: `Permissions-Policy` header eklendi (camera, microphone, geolocation, payment, usb kapatıldı).
- **`ops/systemd/uppoint-cloud.service`**: `TimeoutStopSec=15` — graceful shutdown için 15 saniye süre.
- **`ops/systemd/uppoint-cloud.service`**: `MemoryMax=2G` — bellek sızdırma senaryolarında OOM killer için üst sınır.

### Fixed
- **Logo `Image` bileşenleri**: `unoptimized` prop kaldırıldı (`auth-split-shell.tsx`, `app-header.tsx`, `forgot-password-request-form.tsx`, `reset-password-form.tsx`) — Next.js image optimizer artık logo resimlerini de optimize eder.
- **`add_header` nginx direktifleri**: Tüm `add_header` satırlarına `always` eklendi — hata yanıtlarında da (4xx/5xx) header'lar iletilir.

## 2026-03-01 (Veritabanı index optimizasyonu + PostgreSQL bellek tuning)

### Fixed
- **`prisma/schema.prisma` — LoginChallenge index yeniden yapılandırıldı**:
  - `@@index([mode])` kaldırıldı (cardinality=2, planner kullanmıyordu, write overhead üretiyordu)
  - `@@index([userId])` kaldırıldı, yerine `@@index([userId, mode])` composite eklendi — `deleteChallengesForUserAndMode(userId, mode)` sorgusunu tek index traversal ile karşılar
  - `@@index([loginTokenHash])` eklendi — `consumeLoginToken → findChallengeByTokenHash` sorgusu önceden full table scan yapıyordu; artık index'li
- **PostgreSQL `shared_buffers`**: 128MB → 3GB (15GB RAM'in %20'si). Varsayılan değer sunucu kapasitesini tamamen görmezden geliyordu.
- **PostgreSQL `effective_cache_size`**: 4GB → 11GB (15GB RAM'in %75'i). Query planner artık gerçekçi cache boyutuna göre plan seçer.
- **PostgreSQL `work_mem`**: 4MB → 16MB. Sort/hash join operasyonları için daha az disk I/O.
- **PostgreSQL `log_min_duration_statement`**: disabled → 500ms. 500ms'den uzun sorgular artık loglanıyor — üretimde yavaş sorgu tespiti mümkün.

### Added
- Migration `20260301072030_add_login_challenge_indexes`: LoginChallenge index değişikliklerini veritabanına uygular.

## 2026-03-01 (Veritabanı büyüme ve temizlik iyileştirmeleri)

### Fixed
- **`scripts/cleanup-db.sh`**: LoginChallenge sorgusu düzeltildi — eski hali yalnızca `loginTokenUsedAt IS NOT NULL` (kullanılmış) olanları siliyordu; süresi dolmuş ama tamamlanmamış challenge'lar birikiyordu. Yeni hali `codeExpiresAt < NOW() - 1 saat` olan **tüm** challenge'ları temizliyor.
- **`scripts/cleanup-db.sh`**: `ROW_COUNT()` (MySQL syntax) yerine PostgreSQL uyumlu `WITH d AS (DELETE ... RETURNING ...) SELECT count(*) FROM d` CTE pattern'ına geçildi — artık doğru sayım yapılıyor.
- **`modules/auth/server/login-challenge.ts`**: `findUserByPhone` — `phone` alanında `@unique` constraint olmasına rağmen `findFirst` kullanılıyordu. `findUnique` ile değiştirildi (index kullanımı daha verimli).

### Added
- **`scripts/cleanup-db.sh`**: Eksik 3 tablo için cleanup eklendi:
  - `PasswordResetToken` — `expiresAt < NOW()` olanlar siliniyor
  - `PasswordResetChallenge` — `emailCodeExpiresAt < NOW() - 1 saat` olanlar siliniyor
  - `VerificationToken` — `expires < NOW()` olanlar siliniyor

## 2026-03-01 (Veritabanı güvenilirlik iyileştirmeleri)

### Fixed
- **`scripts/backup-db.sh`**: Sessiz başarısız olma riski giderildi. pg_dump çıktısı önce geçici dosyaya yazılıyor, ardından `gzip -t` bütünlük kontrolü yapılıyor, son olarak atomic `mv` ile kalıcı konuma taşınıyor. Boş dosya ve bozuk arşiv durumunda script hata kodu ile çıkıyor.
- **`db/client.ts`**: Production ortamında Prisma `errorFormat: "minimal"` olarak ayarlandı — internal SQL detayları artık loglara sızamaz. `log: ["error"]` ile sadece hatalar loglanıyor.

### Added
- **`scripts/cleanup-db.sh`**: Veritabanı temizlik scripti. Her gece 03:00 cron ile çalışır. `RateLimitAttempt` (>24 saat), tamamlanmış `LoginChallenge` (>1 saat), `AuditLog` (>90 gün) kayıtlarını siler. Log: `/var/log/uppoint-cleanup.log`.

## 2026-03-01 (Env yapısı düzenleme + ops kurulumu)

### Changed
- **Tek env kaynağı**: `/etc/uppoint-cloud.env` kaldırıldı. `/opt/uppoint-cloud/.env` tek ve gerçek env dosyası oldu (`root:www-data 640`). Systemd servisi artık `EnvironmentFile=/opt/uppoint-cloud/.env` okuyor. Tüm araçlar (Prisma CLI, Next.js runtime, systemd) aynı kaynaktan besleniyor.
- **`ops/systemd/uppoint-cloud.service`**: `EnvironmentFile` yolu `/etc/uppoint-cloud.env` → `/opt/uppoint-cloud/.env` güncellendi.
- **`AUTH_SECRET`**: Dev değeri üretim için güçlü rastgele değerle değiştirildi (`openssl rand -base64 48`).
- **`modules/theme/config.ts`**: `defaultTheme` → `"light"` (AGENTS.md: varsayılan tema açık olmalı).

## 2026-03-01 (Ops kurulumu: backup · monitoring · security)

### Added
- **PostgreSQL 17 yerel kurulum**: Prisma Accelerate (db.prisma.io) yerine self-hosted PostgreSQL 17 (`localhost:5432/uppoint_cloud`). Tüm 7 migration uygulandı.
- **fail2ban** (brute-force koruması): SSH, nginx-http-auth, nginx-limit-req, nginx-botsearch jail'leri aktif. 5 deneme / 10dk → 1 saat ban.
- **ufw güvenlik duvarı**: 22/tcp (SSH), 80/tcp, 443/tcp açık; 5432/tcp (PostgreSQL) dışarıya kapalı.
- **Netdata v2.0.3 izleme**: 127.0.0.1:19999 üzerinde çalışıyor, dışarıya kapalı. CPU, bellek, disk, ağ metrikleri.
- **PostgreSQL otomatik yedek**: `scripts/backup-db.sh` — gzip sıkıştırmalı pg_dump, her gece 02:00 cron ile çalışır, 14 gün saklar (`/opt/backups/postgres/`).
- **Logrotate kuralları**: `/etc/logrotate.d/uppoint-cloud` — backup logu (30 gün) ve PostgreSQL logları (14 gün) döndürülüyor.

## 2026-02-28 (Auth audit: UX/security batch — findings #4-#10, #13-#14)

### Added
- **Email verification akışı** (audit #4):
  - `modules/auth/server/email-verification.ts`: `createAndSendEmailVerificationToken()` + `verifyEmailToken()`.
  - `app/api/auth/verify-email/route.ts`: GET endpoint (rate limited 10/15dk).
  - `app/[locale]/verify-email/page.tsx` + `app/verify-email/page.tsx`: Doğrulama sayfası (success/error UI).
  - Kayıt sonrası verification email otomatik gönderilir; register formu "E-postanızı doğrulayın" success adımını gösterir.
- **Audit logging** (audit #7):
  - `prisma/schema.prisma`: `AuditLog` modeli eklendi. Migration: `20260228182506_add_audit_log`.
  - `lib/audit-log.ts`: `logAudit()` fire-and-forget utility.
  - `login_success`, `login_otp_failed`, `register_success`, `password_reset_success`, `email_verified`, `email_verification_failed` events loglanıyor.
- **Auth sayfaları SEO metadata** (audit #10):
  - `login/page.tsx`, `register/page.tsx`, `verify-email/page.tsx` sayfalarına locale-aware `generateMetadata()` eklendi.
  - TR/EN metadata anahtarları `messages/tr.ts` ve `messages/en.ts`'e eklendi.

### Changed
- **OTP "Yeniden Gönder" butonu** (audit #5):
  - `login-form.tsx`: Email ve phone OTP adımlarında süre dolunca "Yeni kod gönder" butonu görünür; `startEmailChallenge`/`startPhoneChallenge` tekrar çağrılır.
  - `messages/tr.ts` + `messages/en.ts`: `resendCodeIdle`, `resendCodeLoading` anahtarları.
- **Fetch timeout 15sn** (audit #6):
  - `login-form.tsx`, `forgot-password-modal.tsx`, `register-form.tsx`: `fetchWithTimeout()` helper eklendi, tüm `fetch()` çağrıları wrap edildi.
- **Double-submit guard** (audit #13):
  - Tüm async submit fonksiyonlarına `if (isSubmitting) return;` guard eklendi.
- **OTP input autoFocus** (audit #9):
  - `login-form.tsx`: email-otp ve phone-otp input'larına `autoFocus` eklendi.
  - `forgot-password-modal.tsx`: emailCode ve smsCode input'larına `autoFocus` eklendi.
- **Şifre kuralı checklist** (audit #8):
  - `register-form.tsx` ve `forgot-password-modal.tsx`: Strength bar + hint metni kaldırıldı, her kural için ✓/✗ satır göstergesi eklendi.
  - `validation.*` anahtarları: `passwordRuleMin`, `passwordRuleUppercase`, `passwordRuleLowercase`, `passwordRuleNumber`, `passwordRuleSymbol` eklendi.
- **Forgot-password success auto-close** (audit #14):
  - `forgot-password-modal.tsx`: Success adımında 5 sn sonra modal otomatik kapanır.
- **Register auto-login hata mesajı** (audit #15):
  - `messages/tr.ts` + `messages/en.ts`: `autoSignInFailed` mesajı netleştirildi ("Lütfen giriş yapın").
  - `register-form.tsx`: Auto-login başarısız olsa bile success adımı gösterilir.
- **Register locale payload**: `register-form.tsx` locale'i fetch body'ye ekler; `register/route.ts` bunu okuyarak verification email dilini belirler.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓ servis restart edildi

---

## 2026-02-28 (Security: rate limiting + phone code parsing fix — audit findings #1 #3)

### Changed
- `prisma/schema.prisma`: `RateLimitAttempt` modeli eklendi (append-only, IP tabanlı rate limiting için).
- Prisma migration uygulandı: `20260228180747_add_rate_limit_attempt`.
- `lib/rate-limit.ts` oluşturuldu: `getClientIp()`, `checkRateLimit()`, `withRateLimit()` utilities. Probabilistic cleanup (%1 şans) tablo büyümesini önler.
- Tüm 11 auth API route'una rate limiting eklendi:
  - `/api/auth/register`: 5 / 10 dk
  - `/api/auth/login/challenge/email/start`: 10 / 15 dk
  - `/api/auth/login/challenge/email/verify`: 10 / 15 dk
  - `/api/auth/login/challenge/phone/start`: 10 / 15 dk
  - `/api/auth/login/challenge/phone/verify`: 10 / 15 dk
  - `/api/auth/forgot-password/request`: 5 / 10 dk
  - `/api/auth/forgot-password/challenge/start`: 5 / 10 dk
  - `/api/auth/forgot-password/challenge/verify-email`: 10 / 15 dk
  - `/api/auth/forgot-password/challenge/verify-sms`: 10 / 15 dk
  - `/api/auth/forgot-password/challenge/complete`: 5 / 10 dk
  - `/api/auth/forgot-password/reset`: 5 / 10 dk
- `modules/auth/components/phone-input.tsx`: `SORTED_CODES` dizisi eklendi — `COUNTRY_CODES` uzun önekten kısa öneğe sıralandı. `+971` gibi uzun kodlar `+1` ile artık çakışmıyor.
- **NOT**: Denetim raporu middleware.ts'in eksik olduğunu belirtti ancak incelemede `proxy.ts`'in zaten JWT tabanlı route koruması sağladığı görüldü (locale tespiti, secure cookie, callbackUrl dahil). Çift middleware oluşturulmadı.

### Risk / Rollback
- Rate limiting DB tablosuna yazar; yüksek trafik durumunda DB yüküne dikkat. Rollback: `withRateLimit` çağrılarını kaldır + tabloyu sil.
- Destructive değil: yalnızca yeni tablo eklendi, mevcut tablolar değiştirilmedi.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Dark theme palette refined to corporate black)

### Changed
- Updated dark mode tokens in `app/globals.css` from pure black to a more corporate anthracite palette.
- Tuned `background`, `card`, `popover`, `secondary/muted/accent`, and sidebar shades for softer depth.
- Increased dark-mode `border` and `input` opacity so field/container boundaries are clearer.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Login form: telefon identifier adımı PhoneInput ile değiştirildi)

### Changed
- `login-form.tsx`: telefon sekmesindeki identifier adımında `FloatingInput type="tel"` kaldırıldı; register ekranıyla aynı `PhoneInput` bileşeni kullanılıyor (ülke kodu seçici + yerel numara alanı).

### Risk / Rollback
- Saf UI değişikliği; doğrulama mantığı (getPhoneLoginSchema) etkilenmedi — PhoneInput zaten `+90...` formatında tam numara döndürüyor. Rollback: FloatingInput geri yükle.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth shell: hero image kaldırıldı, sistem rengi glow efektleri eklendi)

### Changed
- `auth-split-shell.tsx`: hero image + siyah overlay kaldırıldı.
- Arka plan `bg-background` (sistem teması) olarak ayarlandı.
- 3 adet `primary` renk tabanlı glow blob eklendi (sol-üst büyük, sağ-alt orta, sağ-orta küçük). Light/dark modda farklı opaklık.

### Risk / Rollback
- Görsel değişiklik; kart ve form mantığı etkilenmedi. Rollback: `next/image fill` hero image geri yükle.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Login form UI: ikon bilgi kartları ve büyük OTP input)

### Changed
- `login-form.tsx`: E-Posta şifre adımında hesap bilgi kartına `Mail` ikonu eklendi.
- `login-form.tsx`: Telefon şifre adımında hesap bilgi kartına `Smartphone` ikonu eklendi.
- `login-form.tsx`: E-Posta OTP adımı `FloatingInput` kaldırıldı; büyük monospace kod girişi (`font-mono text-2xl tracking-[0.4em]`, `border-2`, `py-3.5`) ile değiştirildi.
- `login-form.tsx`: Telefon OTP adımı aynı büyük monospace input ile değiştirildi.

### Risk / Rollback
- Saf görsel değişiklik; form mantığı ve OTP doğrulama akışı etkilenmedi. Rollback: FloatingInput geri yükle, ikon konteyner kaldır.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Login upgraded: email/phone tabs with OTP-gated sign-in)

### Changed
- Reworked login UI into a segmented tab flow:
  - `E-Posta`: email -> password -> email OTP
  - `Telefon`: phone -> SMS OTP
- Added 3-minute countdown handling for login OTP steps.
- Enforced sign-in completion through one-time login token consumption (no direct password session creation from the UI flow).
- Added login challenge backend service:
  - `modules/auth/server/login-challenge.ts`
- Added login challenge API routes:
  - `POST /api/auth/login/challenge/email/start`
  - `POST /api/auth/login/challenge/email/verify`
  - `POST /api/auth/login/challenge/phone/start`
  - `POST /api/auth/login/challenge/phone/verify`
- Updated NextAuth credentials provider to consume validated one-time `loginToken`.
- Added Prisma `LoginChallenge` model + migration.
- Added TR/EN localization keys for tabbed OTP login and validation.
- Added test coverage for login challenge service.

### Verification
- `npm run prisma:generate` -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓
- `npm run prisma:migrate:deploy` -> ✓

---

## 2026-02-28 (Auth shell: hero image full-bleed background)

### Changed
- `auth-split-shell.tsx`: düz renk + dot pattern arka plan kaldırıldı; `auth-side-hero.jpg` `next/image fill + object-cover` ile tam sayfa arka plan olarak uygulandı. Üzerine `bg-black/55` overlay eklendi — kart okunabilirliğini korumak için.

### Risk / Rollback
- Görsel değişiklik; kart ve form işlevselliği etkilenmedi. Rollback: solid bg + dot pattern geri yükle.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 25/25 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Forgot-password modal: password strength indicator on new password step)

### Changed
- `forgot-password-modal.tsx`: "Yeni şifre" adımına şifre gücü göstergesi eklendi — `password` state'inden canlı olarak `weak / medium / strong` hesaplanıyor; register formuyla birebir aynı 3-segmentli bar + etiket + hint metni (Info ikonu ile)

### Risk / Rollback
- Yalnızca görsel; iş mantığı değişmedi. Geri almak için strength blok'u kaldırmak yeterli.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 25/25 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Forgot-password modal: professional step-by-step redesign)

### Changed
- `forgot-password-modal.tsx`: tüm adım UI'ı yeniden tasarlandı:
  - **RecoveryStepper**: 4 daireli animasyonlu progress stepper — tamamlananlar yeşil ✓, aktif adım ring efektli, aralarında dolum çizgisi
  - **Email/SMS bilgi kutuları**: sade muted kutu yerine `Mail` / `Phone` ikonu + e-posta/numara + `Clock` ikonu ile kalan süre
  - **Kod girişi**: `FloatingInput` yerine büyük, ortalanmış, monospace, `——————` placeholder'lı `text-2xl tracking-[0.4em]` input
  - **Başarı ekranı**: `Alert` yerine merkezi `CheckCircle` ikonu + başlık + açıklama + buton
  - `max-w-2xl` override kaldırıldı; `AppModal` default `max-w-xl` kullanılıyor
- Tüm iş mantığı (API çağrıları, hata yönetimi, geri sayım) değişmedi

### Risk / Rollback
- Saf UI değişikliği; API/servis katmanı dokunulmadı. Rollback: önceki JSX'e dön.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 25/25 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (PhoneInput: dark mode arka plan ve custom dropdown)

### Changed
- `phone-input.tsx`: native `<select>` yerine custom React dropdown — `bg-popover / border-border / text-popover-foreground` token'ları kullanılıyor; class-based dark modda native select dropdown'u tarayıcı sistemi stilini kullandığından CSS'i takip etmiyordu
- `phone-input.tsx`: outer div'e `dark:bg-input/30` eklendi — `FloatingInput` ile aynı dark background ton uyumu sağlandı
- `phone-input.tsx`: emoji bayraklar (`🇹🇷`) kaldırıldı, `TR +90` formatına geçildi — tarayıcılar emoji'yi metin boyutundan farklı render ettiğinden font tutarsızlığı oluşuyordu

### Risk / Rollback
- Custom dropdown: dışarıya tıklama ile kapanıyor, klavye navigasyonu yok (native select kadar değil). Gerekirse Radix Select kurulabilir.
- Rollback: `CountrySelect` bileşenini kaldırıp native `<select>`'e dön.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 20/20 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Auth shell: tek merkezi kart tasarımı)

### Changed
- `auth-split-shell.tsx`: birden fazla tasarım iterasyonundan (dark split → beyaz → split hero → merkezi kart+hero) sonra nihai tasarım: tek merkezi kart
  - `bg-neutral-100 dark:bg-zinc-950` + radial dot pattern arka plan (slate sınıflarından uzak duruldu — mavi tonu oluşturuyordu)
  - `rounded-2xl border border-border/60 bg-background shadow-2xl dark:border-white/10 dark:shadow-black/60` kart stili — dark modda kartın arka plana karışmaması için
  - Logo (180px genişlik, ışık/karanlık iki varyant), `ThemeToggle iconOnly` + `LocaleSwitcher` üstte
  - Copyright footer en altta
- `theme-toggle.tsx`: `iconOnly` prop eklendi — `size="sm" min-w-10 px-0` ikon-only mod
- `locale-switcher.tsx`: `variant="outline" border-border/70 bg-background/80` stili — ince border eklendi
- `login-form.tsx`, `register-form.tsx`: `headerContent` logo prop kaldırıldı (shell üstlendi)

### Risk / Rollback
- Görsel değişiklik; sayfa işlevselliği aynı. Rollback: `auth-split-shell.tsx` eski versiyona dön.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 20/20 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Forgot-password popup flow with email+SMS verification)

### Changed
- Replaced standalone forgot/reset pages with a popup-based recovery flow inside login.
- Added shared popup foundation component for consistent modal styling:
  - `components/shared/app-modal.tsx`
- Implemented multi-step password recovery modal:
  - step 1: e-mail code request
  - step 2: e-mail code verification with 3-minute countdown
  - step 3: SMS code verification with 3-minute countdown
  - step 4: new password + confirm password
- Added new password reset challenge backend service:
  - `modules/auth/server/password-reset-challenge.ts`
- Added new API routes:
  - `POST /api/auth/forgot-password/challenge/start`
  - `POST /api/auth/forgot-password/challenge/verify-email`
  - `POST /api/auth/forgot-password/challenge/verify-sms`
  - `POST /api/auth/forgot-password/challenge/complete`
- Added Prisma model + migration for multi-step challenge state:
  - `PasswordResetChallenge`
- Added TR/EN localization keys for the popup flow.
- Redirected `/forgot-password` and `/reset-password` pages to localized login; recovery is now popup-only.

### Verification
- `npm run prisma:generate` -> ✓
- `npm run prisma:migrate:deploy` -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero source standardized to auth-side-hero)

### Changed
- Updated auth right-panel image source to `/images/auth/auth-side-hero.jpg`.
- Removed dependency on `/public/images/bg/...` path; `public/images/bg/` is no longer used.
- Restored existing tracked `public/images/auth/auth-hero.jpg` file in repository state to avoid accidental deletion side effects.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image clarity fix while keeping cover)

### Changed
- Kept right panel image `cover` behavior and improved rendering clarity:
  - increased Next.js image quality to `90`
  - corrected `sizes` to match actual right-panel width: `(min-width: 1024px) calc(100vw - 440px), 0px`
- This prevents undersized image selection on wide screens, which previously looked like excessive zoom/blur.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image switched to images/bg/login/login-page.jpg)

### Changed
- Updated auth split-shell right panel image source to `/images/bg/login/login-page.jpg`.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image switched to login-cloud.webp)

### Changed
- Updated auth split-shell right panel image source from `/images/auth/auth-hero.jpg` to `/logo/login-cloud.webp`.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Locale switcher contrast fix for dark auth panel)

### Changed
- Updated `LocaleSwitcher` button styling for better theme contrast and visibility:
  - switched from `ghost` to `outline` variant
  - added explicit foreground/background/border contrast classes for dark auth panel contexts
  - added optional `className` prop for future layout-specific tuning

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image reverted and dark theme enforced)

### Changed
- Reverted auth split hero image source from `/logo/login-page.webp` back to `/images/auth/auth-hero.jpg`.
- Set global default theme to dark (`modules/theme/config.ts`).
- Forced dark theme rendering on auth split shell root for consistent black appearance on login/register pages.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image source switched to login-page.webp)

### Changed
- Updated auth split hero image source from `/images/auth/auth-hero.jpg` to `/logo/login-page.webp` in `modules/auth/components/auth-split-shell.tsx`.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages: dark split layout redesign)

### Changed
- `auth-split-shell.tsx`: complete redesign — dark forced (`dark` class on root), left panel has logo + locale switcher at top and form centered, right panel uses emerald radial gradient + grid motif + glow blobs + feature list (`highlights`) + badges; no hero image dependency
- `floating-input.tsx`: label background changed `bg-card` → `bg-background` so floating label blends correctly with dark form panel
- `login-form.tsx`: removed in-form logo (now provided by shell)
- `register-form.tsx`: removed in-form logo and unused `Image` import

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 20/20 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Auth hero eyebrow text changed to CLOUD)

### Changed
- Updated auth right-panel eyebrow label from `UPPOINT CLOUD` to `CLOUD` for both TR and EN locale dictionaries.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero brand text styling improved)

### Changed
- Improved right-panel hero brand block on auth pages:
  - added white Uppoint logo in the overlay brand row
  - increased and refined `UPPOINT CLOUD` label styling
  - applied subtle glass-style container for better readability over the image

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth left panel controls simplified and top-aligned)

### Changed
- Removed theme toggle button from auth split layout controls.
- Kept only locale switcher in the left panel.
- Moved left panel alignment from centered to top-aligned.
- Updated locale switcher placement to be left-aligned at the top of the left panel.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages switched to full-screen two-panel layout)

### Changed
- Removed card-like outer container from auth split shell and switched to full-screen two-panel layout.
- Left auth panel now spans full height with a clean surface; right panel remains full-bleed hero image on desktop and hidden on mobile.
- Added `surface` mode support to `AuthCard` and set login/register flows to `plain` so auth area is no longer rendered as a standalone card block.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages remove global navbar and move controls into left panel)

### Changed
- Removed global localized navbar rendering from `app/[locale]/layout.tsx` to keep auth pages strictly two-pane.
- Moved locale switcher and theme toggle from top navbar into the auth left panel (`AuthSplitShell`), above the login/register cards.
- Removed auth shell header-offset spacing (`-mt-16`, header-specific top padding) since navbar is no longer rendered.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth split layout updated with full-image right panel)

### Changed
- Updated auth split shell visual style to match requested layout:
  - login/register content stays on the left panel
  - right panel now renders a full-cover hero image on desktop
  - right panel remains hidden on mobile for focused form flow
- Downloaded and added a dedicated auth-side hero image:
  - source: Unsplash
  - file: `public/images/auth/auth-side-hero.jpg`
- Added subtle dark overlay + lightweight dot texture on top of the hero image to keep overlay text readable.
- Kept existing localized auth panel copy and trust badges over the image.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth split layout and subtle textured background)

### Changed
- Implemented split auth layout for localized login/register pages:
  - auth form card remains on the left
  - brand/trust panel is rendered on the right for desktop
  - right panel is hidden on mobile
- Added localized auth side-panel content (TR default, EN secondary):
  - short brand copy
  - trust badges (`7/24 destek`, `Güvenli altyapı`, etc.)
  - concise highlight rows
- Updated auth page background treatment with low-opacity gradient + subtle texture/pattern to reduce empty-space feel without visual noise.
- Kept navbar container transparent so page background remains visible behind header area.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages brand motif background)

### Changed
- Added a subtle brand-motif background layer for localized login and register pages to reduce empty visual space while preserving readability.
- Applied subtle radial dotted texture motif placements at auth page corners for stronger brand consistency.
- Kept forgot-password and reset-password pages unchanged for focused flow consistency.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth flow UX polish and emerald theme tokens)

### Changed
- Updated header logo target from locale root redirect to direct localized login route to remove redirect-jump effect when clicking the brand logo on login pages.
- Updated login flow so `Şifremi unuttum?` / `Forgot password?` is shown only on the password step (after entering email), not on the first identifier step.
- Applied emerald-focused primary/ring tokens for both light and dark themes (`--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring`) in global theme palette.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Build now auto-restarts Next.js service)

### Changed
- Updated `npm run build` to run `next build` and then automatically restart `uppoint-cloud.service` when systemd service is available.
- Added `service:restart` npm script with safe detection and explicit restart status output.
- Added `NEXT_SKIP_SERVICE_RESTART=1` bypass support for maintenance/deploy flows that intentionally keep the service stopped.
- Updated deployment docs to reflect auto-restart behavior and the bypass command.
- Increased login and register auth-card title size to `24px` (`text-2xl`) via reusable `AuthCard` title class support.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Password reset flow connected end-to-end)

### Added
- Added `Şifremi unuttum?` / `Forgot password?` link to login flow (visible in both login steps).
- Added localized forgot-password request pages:
  - `/{locale}/forgot-password`
  - `/forgot-password` (default locale redirect)
- Added localized reset-password pages:
  - `/{locale}/reset-password`
  - `/reset-password` (default locale redirect)
- Added password reset API endpoints:
  - `POST /api/auth/forgot-password/request`
  - `POST /api/auth/forgot-password/reset`
- Added password-reset server service with secure token hashing and TTL-based expiry.
- Added Prisma `PasswordResetToken` model and migration for token persistence.

### Changed
- Included `/forgot-password` and `/reset-password` in auth-route redirect rules so authenticated users are sent to dashboard.
- Updated route-access tests for new auth route coverage.
- Updated README with password-reset routes, architecture, and env requirements.

### Verification
- `npm run prisma:generate` -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (TR login email label text update)

### Changed
- Updated Turkish login first-step identifier label from "E-posta veya telefon numarası" to "E-Posta".

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages background effects removed)

### Changed
- Removed decorative blob background effect layers from localized login and register pages.
- Simplified auth page `<main>` wrappers by dropping effect-related positioning classes (`relative`, `isolate`, `overflow-hidden`).

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth account/email summary UI refinement)

### Changed
- Improved the step-2 account/email summary presentation in auth forms for better readability and hierarchy.
- Updated login and register summary blocks to a consistent card style using theme tokens (border + muted background + stronger value emphasis).

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Register phone label visibility update)

### Changed
- `register` formundaki telefon alanı başlığı görselden kaldırıldı (`Label` artık `sr-only`)
- Erişilebilirlik için telefon alanı etiketi screen-reader seviyesinde korunmaya devam ediyor

### Verification
- `npm run lint` → ✓
- `npm run typecheck` → ✓
- `npm run test` → ✓
- `npm run build` → ✓

---

## 2026-02-28 (Register phone input height alignment)

### Fixed
- `register` sayfasındaki `PhoneInput` yüksekliği `h-9` idi; `Ad Soyad` ve `Şifre` alanları (`FloatingInput`) ile uyumlu olacak şekilde `h-12` olarak güncellendi
- Bileşik telefon alanında iç `select` ve `input` elemanları `h-full` yapılarak dikey hizalama tutarlı hale getirildi

### Verification
- `npm run lint` → ✓
- `npm run typecheck` → ✓
- `npm run test` → ✓
- `npm run build` → ✓

---

## 2026-02-28 (Auth forms: floating label inputs)

### Added
- `FloatingInput` component (`components/ui/floating-input.tsx`): floating label pattern — label sits inside the input at center, floats to the top border on focus or when a value is present; uses `useState` for focus tracking + `peer-placeholder-shown` for value detection; styled to match shadcn `Input` tokens

### Changed
- `login-form.tsx`: email and password fields now use `FloatingInput` (removed `Label + Input` pairs)
- `register-form.tsx`: email, name, and password fields now use `FloatingInput`; phone field keeps `Label + PhoneInput` (composite component)

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---


## 2026-02-28 (Register form: info icon on password hint)

### Changed
- Password hint now prefixed with Lucide `Info` icon (`h-3 w-3 mt-0.5 shrink-0`) for visual clarity

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Register form: password requirements hint)

### Added
- Static `passwordHint` text shown below the password strength bar on the register form
- `validation.passwordHint` key in TR and EN dictionaries
- TR: "Şifre en az 12 karakter ve büyük harf, küçük harf, rakam ile sembol içermelidir."
- EN: "Password must be at least 12 characters and include an uppercase letter, lowercase letter, number, and symbol."

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Auth pages: fix blob visibility — add isolate to main)

### Fixed
- Blobs were not visible: `<main>` lacked a stacking context, so `-z-10` blobs fell behind the page's opaque white background
- Added `isolate` class (`isolation: isolate`) to `<main>` on both login and register pages so blobs render correctly above the page background and below the card

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Auth pages: gradient blob background + glassmorphism card)

### Changed
- Login and register pages: added 3 decorative gradient blobs (indigo/violet/sky, `blur-[120px]`, `pointer-events-none aria-hidden -z-10`)
- `AuthCard`: `bg-card/80 backdrop-blur-md shadow-2xl` for frosted glass effect
- Login/register `<main>`: `min-h-[calc(100vh-3.5rem)]` → `min-h-[calc(100vh-4rem)]` (aligned with h-16 header)
- Login blob arrangement: indigo top-left, violet bottom-right, sky center
- Register blob arrangement: violet top-left, indigo bottom-right, sky upper-right

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (AppHeader: logo 180px wide, fix layout jump)

### Changed
- Logo width: `h-8 w-auto` → `w-[180px] h-auto` (explicit width reserves layout space, eliminates CLS on click)
- Header inner div: `h-14` → `h-16` to accommodate taller logo (~55px at 180px width)
- Logo Link: added `shrink-0` to prevent flex compression causing layout shift

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (PhoneInput: digits only + no leading zero)

### Changed
- `PhoneInput`: local number field now accepts digits only (`newNumber.replace(/\D/g, "")`) and strips leading zeros — prevents letters, spaces, dashes, etc.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (PhoneInput: strip leading zeros from local number)

### Changed
- `PhoneInput`: local number field now strips leading zeros on input (`newNumber.replace(/^0+/, "")`) — prevents entering `0` after country code

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Required Phone Field with Country Code Selector)

### Changed
- Phone field in registration form is now **required** (previously optional)
- Zod `createPhoneSchema`: removed empty-string bypass (`value === ""`), added `min(1, phoneRequired)`, removed `.default("")` from `getRegisterSchema`
- Phone field label: "Telefon (opsiyonel)" → "Telefon" (TR), "Phone (optional)" → "Phone" (EN)
- `register-form.tsx`: raw `<Input>` replaced with `<Controller>` + `<PhoneInput>`
- `tests/auth/register-user.test.ts`: `EMAIL_TAKEN` fixture now includes required `phone` field

### Added
- `PhoneInput` component (`modules/auth/components/phone-input.tsx`): country code `<select>` (20 countries, TR +90 default) + local number `<input>`, combined output in E.164 format via `Controller`
- `validation.phoneRequired` message key in TR and EN dictionaries

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Localized Email Validation Messages)

### Fixed
- Replaced default Zod English email validation output with locale-aware messages for Turkish and English.
- Ensured login/register email validation uses the current locale dictionary instead of global non-localized schema text.

### Added
- Auth schema tests to verify locale-specific email validation messages for `tr` and `en`.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Two-Step Login UX)

### Changed
- Updated login flow to two-step progression:
  - Step 1: identifier input with `Sonraki` / `Next`
  - Step 2: password input and final sign-in action
- Added localized account summary and back action labels for the password step.
- Kept existing auth/session backend flow unchanged while improving login interaction parity with requested UX.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Login Brand Copy and Logo Alignment)

### Changed
- Added theme-aware Uppoint logo rendering to the login card header without altering existing auth flow structure.
- Revised TR/EN login copy to align with Uppoint Cloud product language.
- Extended shared `AuthCard` to accept optional header content for reusable branded auth headers.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Production Stability Hardening)

### Fixed
- Resolved production rendering break caused by stale build artifacts and Next.js image cache permission errors.
- Ensured root and locale entry flow remains login-first while preserving stable CSS delivery.

### Changed
- Updated logo rendering to `next/image` with `unoptimized` to avoid runtime optimizer cache write dependency for static local logo files.
- Hardened systemd service with `ExecStartPre` directory initialization for `.next/cache/images` under `www-data`.
- Expanded operational runbook with mandatory safe deploy sequence and post-deploy health checks.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- Runtime checks:
  - `curl -I https://cloud.uppoint.com.tr/tr/login` => `200`
  - CSS asset referenced by login page => `200`
  - logo assets `/logo/uppoint-logo-black.webp` and `/logo/Uppoint-logo-wh.webp` => `200`

## 2026-02-28 (Root Entry Redirect to Login)

### Changed
- Removed localized home landing behavior from root entry.
- Updated `/` and `/{locale}` entry routes to redirect directly to `/{locale}/login`.
- Aligned default first contact flow with authentication-first requirement.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Theme-Aware Brand Logo Integration)

### Changed
- Updated shared app header to render theme-specific brand logos.
- Light theme now uses `/logo/uppoint-logo-black.webp`.
- Dark theme now uses `/logo/Uppoint-logo-wh.webp`.

### Documentation
- Added logo asset naming/placement requirements under `README.md`.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Theme Compliance and UX Controls)

### Added
- Theme provider with persisted user preference (`light`/`dark`) and default light behavior.
- Theme initialization script to prevent inconsistent first paint between saved theme and rendered UI.
- Shared locale header with theme toggle and locale switch controls.
- Manual dark/light visual smoke checklist for TR/EN auth flows in `README.md`.

### Changed
- Updated localized layouts to include shared header controls.
- Refined auth/dashboard page shells to account for header space in viewport layout.
- Removed hardcoded destructive button text color in favor of theme token usage.
- Extended design tokens with `destructive-foreground` for consistent contrast across themes.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Production Middleware Session Fix)

### Changed
- Updated `proxy.ts` token resolution to use HTTPS-aware secure cookie detection for `next-auth` session token lookup.
- Fixed production route protection behavior where authenticated users were redirected back to login despite valid sessions.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- Live E2E checks on `https://cloud.uppoint.com.tr` for `/tr` and `/en` auth flows.

## 2026-02-28 (Localization Revision)

### Added
- Dedicated localization structure under `modules/i18n` and `messages`.
- Turkish (`tr`) and English (`en`) dictionaries for home, auth forms, dashboard, and validation messages.
- Locale-aware App Router pages under `app/[locale]/`.
- Locale path helper tests in `tests/i18n/paths.test.ts`.

### Changed
- Updated auth UI components to consume locale dictionaries instead of hardcoded copy.
- Updated auth route-access logic and proxy behavior to enforce locale-aware redirects.
- Updated registration API to return stable error codes for locale-safe frontend mapping.
- Updated root and legacy routes to redirect to default locale (`/tr`).
- Updated `README.md` to document `.env` usage and locale-aware routing.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28

### Added
- SMTP email service integration for auth registration notifications.
- Verimor SMS service integration for auth registration notifications.
- Optional phone field support in registration form and auth schema.
- Prisma migration for nullable/unique `User.phone`.

### Changed
- Extended environment validation with `UPPOINT_*` email/SMS configuration, including conditional requirements.
- Updated registration API flow to dispatch email/SMS notifications after successful account creation.
- Updated `.env.example` and `README.md` to document email/SMS runtime requirements.

### Verification
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-27

### Added
- Authentication MVP with registration, login, logout, and protected dashboard placeholder routes.
- Auth module structure under `modules/auth` for schemas, server services, and reusable form components.
- Auth.js (`next-auth`) integration with Prisma adapter and database-backed session persistence.
- Prisma auth schema models (`User`, `Account`, `Session`, `VerificationToken`) for production-minded auth storage.
- Middleware-based route protection and auth-aware redirects.
- Nginx production configs and systemd service definition under `ops/`.
- Let's Encrypt issuance and renewal runbook in `ops/README.md`.
- Vitest test setup with auth-focused unit tests.

### Changed
- Expanded environment validation to include auth-related required variables.
- Updated root page copy to reflect authentication milestone status.
- Updated `.env.example` and `README.md` with auth and production serving requirements.

### Verification
- `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-27 (Foundation Bootstrap)

### Added
- Bootstrapped Next.js App Router project with TypeScript strict mode and Tailwind CSS.
- Initialized shadcn/ui configuration and added base `Button` primitive.
- Added Zod-based server environment validation and startup validation hook.
- Added Prisma foundation for PostgreSQL and reusable Prisma client layer.
- Added `.env.example` and baseline project folder structure (`db`, `lib/env`, `modules/auth`, `tests`, `types`).

### Changed
- Replaced default landing page with a minimal foundation status page.
- Updated `README.md` with bootstrap and verification instructions.
- Enabled explicit `reactStrictMode` in Next.js config.

### Verification
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test` (no script defined yet)
