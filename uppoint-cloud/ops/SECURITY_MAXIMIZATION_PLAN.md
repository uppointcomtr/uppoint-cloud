# Security Maximization Plan (Top 5)

This file tracks the highest-impact next hardening steps for `cloud.uppoint.com.tr`.

## Scope and intent

- Prioritize controls that reduce auth compromise, tenant leakage, and forensic blind spots.
- Keep UI behavior stable while improving backend and operational security posture.
- Treat all items as production-governed changes (verify before release).

## Top 5 actions

| ID | Action | Why it matters | Current state | Frontend break risk |
| --- | --- | --- | --- | --- |
| S1 | Enforce security gate (`verify:security-gate`) | Prevents shipping partially verified auth/security changes | Implemented in repo scripts and AGENTS policy | None |
| S2 | Internal API mTLS rollout for privileged internal routes | Prevents token-only trust becoming single point of compromise | Implemented baseline transport contract (`x-internal-transport`) with loopback mode default and mTLS mode gate | None |
| S3 | Immutable local audit anchoring + offline transfer procedure | Preserves forensic integrity in closed-system mode while keeping off-host egress disabled by default | Implemented: `export-audit-anchor` script + cron export pipeline | None |
| S4 | Formal secret rotation runbook with overlap windows | Reduces blast radius of key/token leaks and config drift | Implemented runbook under `ops/runbooks/secret-rotation.md` | None |
| S5 | Abuse-response automation (rate-limit anomaly to alert/playbook) | Speeds incident response for credential stuffing and OTP abuse | Implemented: threshold checker + cron + alert integration | None |

## Implementation notes

### S1 — Security gate

Added:

- `scripts/verify-security-gate.sh`
- `npm run verify:security-gate`
- AGENTS mandate for security-sensitive surfaces

Execution:

```bash
cd /opt/uppoint-cloud
npm run verify:security-gate
```

### S2 — Internal API mTLS rollout

Target internal routes:

- `/api/internal/audit/security-event`
- `/api/internal/notifications/dispatch`

Implemented baseline:

1. Keep existing token + HMAC signature checks active.
2. Enforce explicit transport mode header (`x-internal-transport`) with env-controlled mode (`loopback-hmac-v1` / `mtls-hmac-v1`).
3. Keep loopback enforcement for current production baseline.

Next hardening:

1. Add mTLS termination and client-cert allowlist at Nginx layer for privileged internal locations.
2. Enforce dual-control period (mTLS + signed token) before token-only fallback is removed.

### S3 — Immutable local audit anchoring (closed-system baseline)

Implemented:

1. Added `scripts/export-audit-anchor.mjs` + `scripts/export-audit-anchor.sh`.
2. Added daily cron template: `ops/cron/uppoint-audit-anchor-export`.
3. Export record includes deterministic anchor metadata and HMAC signature.

Closed-system baseline:

1. Keep anchor export local (`/opt/backups/audit`) and append-only.
2. Use offline/manual transfer procedures only when explicitly owner-approved.

Owner-approved exception path (off-host):

1. Enable `UPPOINT_CLOSED_SYSTEM_MODE=false` and `UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=true`.
2. Configure WORM destination and add rollback/disable steps in ops runbooks before activation.

### S4 — Secret rotation runbook

Implemented:

- `ops/runbooks/secret-rotation.md`

Scope:

- `AUTH_SECRET`
- `AUTH_OTP_PEPPER`
- `INTERNAL_AUDIT_TOKEN`
- `INTERNAL_DISPATCH_TOKEN`
- `INTERNAL_AUDIT_SIGNING_SECRET`
- `INTERNAL_DISPATCH_SIGNING_SECRET`
- `NOTIFICATION_PAYLOAD_SECRET`
- `AUDIT_LOG_SIGNING_SECRET`

Runbook contract:

1. Maintain rotation cadence and ownership.
2. Use overlap windows for signer/validator pairs where protocol supports dual-key verification.
3. Record every rotation event in audit/ops changelog with rollback note.

### S5 — Abuse-response automation

Implemented:

1. Added signal checker: `scripts/check-auth-abuse-signals.mjs`.
2. Added runner + alerting hooks: `scripts/run-auth-abuse-check.sh`, `scripts/alert-auth-abuse.sh`.
3. Added cron template: `ops/cron/uppoint-auth-abuse-check`.

Next hardening:

1. Tune thresholds per ASN/device risk class.
2. Add incident drill cadence for lockout abuse / OTP flood / notification queue saturation.

## Verification contract

After any S2-S5 change, run:

```bash
cd /opt/uppoint-cloud
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify:security-gate
```
