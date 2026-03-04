# Findings Register

Canonical security/architecture findings register for `cloud.uppoint.com.tr`.

Purpose:
- keep findings stable across audit rounds,
- prevent duplicate IDs for the same issue,
- enforce explicit closure evidence.

## Scope

This register covers:
- code, config, and ops findings,
- security vulnerabilities,
- audit/observability gaps,
- structural and scalability design smells.

It does not replace `CHANGELOG.md`; it complements it.

## Rules

1. Always use a stable ID (`F1`, `F2`, ...).
2. Do not create a new finding for an already known issue. Update the existing row.
3. Every status change must include evidence.
4. A finding can be closed only when closure criteria are verified.
5. Re-open a closed finding if regression evidence exists.
6. Include UI impact explicitly (`High/Medium/Low/None`).
7. Distinguish working behavior from design correctness.

## Status model

- `open`: confirmed issue not fixed yet
- `in_progress`: fix work started, not fully verified
- `blocked`: cannot be fixed now (explicit blocker required)
- `closed`: fixed and verified with evidence
- `accepted_risk`: intentionally deferred with owner approval

## Findings Table

| ID | Title | Category | Severity | UI Break Risk | Status | First Seen (UTC) | Last Updated (UTC) | Owner | Evidence (file/command) | Closure Criteria |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Hash compare robustness: malformed digest must not crash auth verification | security | High | None | closed | 2026-03-03 | 2026-03-03 | codex | `lib/security/constant-time.ts`, `modules/auth/server/login-challenge.ts`, `modules/auth/server/register-verification-challenge.ts`, `modules/auth/server/password-reset-challenge.ts` | Use centralized `timingSafeEqualHex()` with hex/length guards for OTP and reset-token hash compares; verify with lint/typecheck/tests/build |
| F2 | Missing idempotency on OTP verification endpoints | security/reliability | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `app/api/auth/login/challenge/email/verify/route.ts`, `app/api/auth/login/challenge/phone/verify/route.ts`, `app/api/auth/forgot-password/challenge/verify-sms/route.ts` | OTP verify endpoints wrapped with `withIdempotency(...)` and pass verification suite |
| F3 | Login OTP verify audit coverage incomplete for validation/rejected attempts | observability/audit | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `app/api/auth/login/challenge/email/verify/route.ts`, `app/api/auth/login/challenge/phone/verify/route.ts` | All failed verify branches emit `logAudit("login_otp_failed", ...)` with explicit reason; verify with tests/build |
| F4 | Internal endpoint exposure lacked source-network guardrail | security/defense-in-depth | High | None | closed | 2026-03-03 | 2026-03-03 | codex | `lib/security/internal-request-auth.ts`, `app/api/internal/**/route.ts`, `proxy.ts`, `ops/nginx/cloud.uppoint.com.tr.conf` | Enforce loopback-only source for internal routes in production + edge-layer `/api/internal/` loopback restriction; verify via tests + curl |
| F5 | NextAuth secondary limiter keyed only by action path | abuse-resilience | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `app/api/auth/[...nextauth]/route.ts`, `tests/auth/nextauth-route-rate-limit.test.ts` | Secondary limiter key must include action and client IP; test asserts key shape |
| F6 | Repo/app-root contract ambiguity could cause ops drift | operational | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `scripts/check-repo-root-contract.sh`, `package.json`, `/opt/.github/workflows/remote-auth-smoke.yml` | Add explicit repo-layout verification and enforce it in CI |
| F7 | Instances domain boundary lacked enforceable guardrails | architecture | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `tests/instances/instances-surface-guardrail.test.ts` | Add automated guardrails for future `/instances` entry points and forbid direct hypervisor coupling in boundary |
| F8 | Audit immutability allowed unrestricted row deletion | security/audit-integrity | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `prisma/migrations/20260303200000_enforce_audit_log_delete_guard/migration.sql`, `scripts/cleanup-db.sh` | DB trigger blocks delete unless retention guard flag is set; cleanup path uses explicit retention guard |
| F9 | Logout endpoint lacked idempotency protection | reliability/audit-noise | Low | None | closed | 2026-03-03 | 2026-03-03 | codex | `app/api/auth/logout/route.ts` | Wrap logout handler with `withIdempotency("auth:logout", ...)` |
| F10 | Edge security telemetry could be dropped due to proxy host/origin/IP guard conflict | security/observability | High | None | closed | 2026-03-03 | 2026-03-03 | codex | `proxy.ts`, `app/api/internal/audit/security-event/route.ts`, live smoke (`POST http://127.0.0.1:3000/api/internal/audit/security-event` previously `400 INVALID_HOST_HEADER`) | Add narrow trusted ingress path for signed loopback internal audit emit; verify by signed local POST returns 202 |
| F11 | Edge security telemetry emit failures were silently swallowed | observability | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `proxy.ts` catch block in `emitEdgeSecurityAudit` | Emit structured error logs for telemetry delivery failure without leaking secrets |
| F12 | Edge telemetry emit failures lacked periodic alerting pipeline | operational/security-monitoring | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `scripts/run-edge-audit-emit-check.sh`, `scripts/alert-edge-audit-emit.sh`, `ops/cron/uppoint-edge-audit-emit-check`, `ops/logrotate/uppoint-cloud` | Add fail-pattern monitor with cooldown + Slack/email alert channels and cron deployment instructions |
| F13 | Ops email alert enqueue used psql variable interpolation mode that fails with inline `-c` execution | operational/reliability | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `scripts/alert-edge-audit-emit.sh`, `scripts/alert-nginx-drift.sh`, manual smoke run output (`syntax error at or near \":\"`) | Use `psql -f` with explicit `-v` variables for SQL templating; verify with real outbox enqueue + dispatch |
| F14 | JWT session revalidation cache delayed password-reset session invalidation in production | security/session | High | None | closed | 2026-03-03 | 2026-03-03 | codex | `auth.ts` (`SESSION_REVALIDATION_CACHE_ENABLED`), `modules/auth/server/password-reset-challenge.ts` | Disable revalidation cache in production so tokenVersion bumps invalidate active JWT sessions immediately |
| F15 | Deprecated auth endpoints could degrade to identifier-only throttling when trusted IP context is unavailable | security/abuse-resilience | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `app/api/auth/verify-email/route.ts`, `app/api/auth/forgot-password/request/route.ts`, `app/api/auth/forgot-password/reset/route.ts`, `tests/auth/deprecated-routes-rate-limit-context.test.ts` | Fail closed with `503 RATE_LIMIT_CONTEXT_UNAVAILABLE` in production when trusted client IP cannot be resolved |
| F16 | Internal security-event invalid payload attempts were not audited | observability/audit | Low | None | closed | 2026-03-03 | 2026-03-03 | codex | `app/api/internal/audit/security-event/route.ts`, `lib/audit-log.ts`, `tests/internal/security-event-route.test.ts` | Audit JSON parse/schema validation failures with structured reason and requestId |
| F17 | Auth OTP notifications lacked explicit priority in outbox dispatch ordering | reliability/scale | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `modules/notifications/server/outbox.ts` | Prioritize `metadata.scope LIKE 'auth-%'` records in candidate ordering to reduce OTP latency under load |
| F18 | Tenant-query guardrail did not scan infra layers (`db/`, `lib/`) | architecture/tenant-isolation | Medium | None | closed | 2026-03-03 | 2026-03-03 | codex | `tests/tenant/tenant-guardrail.test.ts` | Expand guardrail scan roots to include `db/` and `lib/` to prevent unreviewed direct tenant queries outside app/modules |
| F19 | Internal mTLS transport was blocked by unconditional production loopback requirement | security/transport-auth | High | None | closed | 2026-03-04 | 2026-03-04 | codex | `lib/security/internal-route-guard.ts`, `tests/security/internal-request-auth.test.ts`, `tests/internal/internal-route-guardrail.test.ts` | Loopback source is enforced only for `loopback-hmac-v1`; `mtls-hmac-v1` remains protected with token + signature + verified mTLS headers |
| F20 | Audit metadata redaction did not sanitize sensitive strings inside arrays | security/logging | Medium | None | closed | 2026-03-04 | 2026-03-04 | codex | `lib/audit-log.ts`, `tests/auth/audit-log.test.ts` | Redaction must recurse into arrays and nested objects, masking sensitive values/keys consistently |
| F21 | Notification dispatch script allowed unsafe production target override in loopback mode | security/ops | Medium | None | closed | 2026-03-04 | 2026-03-04 | codex | `scripts/dispatch-notifications.sh`, `ops/README.md` | Production loopback mode blocks remote domain/IP overrides unless explicit approved exception flags are set |
| F22 | Nightly remote smoke policy could permit mutation smoke against production base URL | operational/security-testing | Medium | Low | closed | 2026-03-04 | 2026-03-04 | codex | `/opt/.github/workflows/remote-auth-smoke.yml`, `README.md` | Scheduled workflow must fail when mutations are enabled against production URL; mutation smoke stays manual/non-production |

## Change Log (Register-only)

Record only register updates here (not general product changes).

| Date (UTC) | Finding ID | Change | Evidence |
|---|---|---|---|
| 2026-03-03 | F1 | Register initialized with template row | Added `FINDINGS_REGISTER.md` |
| 2026-03-03 | F1 | Closed: hash comparisons hardened with centralized constant-time helper | `lib/security/constant-time.ts` + auth service updates |
| 2026-03-03 | F2 | Closed: verify routes now enforce idempotency wrapper | login/forgot-password verify route updates |
| 2026-03-03 | F3 | Closed: login OTP verification failures fully audited | verify route audit branch updates |
| 2026-03-03 | F4 | Closed: internal routes now require loopback source in production and edge-layer loopback-only nginx location | internal request auth + route + nginx updates |
| 2026-03-03 | F5 | Closed: nextauth secondary limiter scope now includes client IP | nextauth route + unit test |
| 2026-03-03 | F6 | Closed: repository/app-root contract now explicitly verified in scripts and CI workflow | repo-layout verify script + workflow step |
| 2026-03-03 | F7 | Closed: instances future-surface guardrail test added | `tests/instances/instances-surface-guardrail.test.ts` |
| 2026-03-03 | F8 | Closed: audit deletes blocked by DB trigger unless retention guard is explicitly set | migration + cleanup script guard flag |
| 2026-03-03 | F9 | Closed: logout endpoint wrapped with idempotency protection | logout route update |
| 2026-03-03 | F10 | Closed: proxy now allows only narrow trusted internal audit ingress for signed loopback emit path | `proxy.ts` trusted ingress guard + signed local emit smoke |
| 2026-03-03 | F11 | Closed: edge telemetry emit catch now logs structured failure signal | `proxy.ts` catch logging |
| 2026-03-03 | F12 | Closed: edge audit emit failure monitor and alert pipeline added with cooldown + cron integration | edge-audit check/alert scripts + cron + logrotate/docs |
| 2026-03-03 | F13 | Closed: outbox email alert insert now uses portable `psql -f` + `-v` variable binding in both alert scripts | manual enqueue smoke + dispatch verification |
| 2026-03-03 | F14 | Closed: production JWT callback now bypasses revalidation cache for immediate tokenVersion invalidation | `auth.ts` |
| 2026-03-03 | F15 | Closed: deprecated auth routes now fail closed without trusted rate-limit IP context in production | deprecated route files + `tests/auth/deprecated-routes-rate-limit-context.test.ts` |
| 2026-03-03 | F16 | Closed: internal security-event route now audits invalid-body attempts | route + audit action + unit test |
| 2026-03-03 | F17 | Closed: outbox dispatch ordering now prioritizes auth-scoped notifications | `modules/notifications/server/outbox.ts` |
| 2026-03-03 | F18 | Closed: tenant direct-query guardrail scan now includes `db/` and `lib/` layers | `tests/tenant/tenant-guardrail.test.ts` |
| 2026-03-04 | F19 | Closed: internal route guard now applies loopback requirement only for loopback transport mode, enabling secure mTLS transport path | `lib/security/internal-route-guard.ts` + internal auth tests |
| 2026-03-04 | F20 | Closed: audit metadata redaction now traverses arrays and nested values | `lib/audit-log.ts`, `tests/auth/audit-log.test.ts` |
| 2026-03-04 | F21 | Closed: production dispatch script now blocks unsafe remote override in loopback mode unless explicit approved exception flags are set | `scripts/dispatch-notifications.sh`, `ops/README.md` |
| 2026-03-04 | F22 | Closed: nightly remote smoke now blocks production mutation mode and docs updated accordingly | `/opt/.github/workflows/remote-auth-smoke.yml`, `README.md` |

## Audit Output Contract

All audit rounds must reference this register:
- reuse existing IDs when the issue is already tracked,
- add only new independent findings,
- for each closed finding, include exact verification commands and results.

Required minimum evidence for closure:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- targeted smoke/ops checks for the changed surface (for example `verify:nginx-drift`, `verify:audit-integrity`, or route-level curl checks).
