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
