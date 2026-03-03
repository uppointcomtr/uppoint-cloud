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
| - | - | - | - | - | - | - | - | - | - | - |

## Change Log (Register-only)

Record only register updates here (not general product changes).

| Date (UTC) | Finding ID | Change | Evidence |
|---|---|---|---|
| 2026-03-03 | F1 | Register initialized with template row | Added `FINDINGS_REGISTER.md` |

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
