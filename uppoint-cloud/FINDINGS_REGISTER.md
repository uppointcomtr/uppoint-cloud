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

## Change Log (Register-only)

Record only register updates here (not general product changes).

| Date (UTC) | Finding ID | Change | Evidence |
|---|---|---|---|
| 2026-03-03 | F1 | Register initialized with template row | Added `FINDINGS_REGISTER.md` |
| 2026-03-03 | F1 | Closed: hash comparisons hardened with centralized constant-time helper | `lib/security/constant-time.ts` + auth service updates |
| 2026-03-03 | F2 | Closed: verify routes now enforce idempotency wrapper | login/forgot-password verify route updates |
| 2026-03-03 | F3 | Closed: login OTP verification failures fully audited | verify route audit branch updates |

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
