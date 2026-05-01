# Runbook Coverage Matrix

This matrix keeps operational security controls paired with a concrete response path.

| Mechanism family | Primary runbook | Health / verification command | Main log |
| --- | --- | --- | --- |
| Auth OTP and provider delivery | `ops/runbooks/otp-provider-failure.md` | `npm run verify:notification-canary` | `/var/log/uppoint-notification-canary.log` |
| Internal HMAC service routes | `ops/runbooks/internal-hmac-route-failure.md` | `npm run verify:security-gate` | `journalctl -u uppoint-cloud.service` |
| Audit integrity and anchor export | `ops/runbooks/audit-integrity-anchor-failure.md` | `npm run verify:audit-integrity && npm run audit:anchor:export` | `/var/log/uppoint-audit-integrity-check.log` |
| Closed-system egress policy | `ops/runbooks/closed-system-egress-violation.md` | `npm run verify:security-gate` | `/var/log/uppoint-cloud/security-alerts.log` |
| Notification canary and security SLO | `ops/runbooks/notification-canary-slo-failure.md` | `npm run verify:notification-canary && npm run verify:security-slo` | `/var/log/uppoint-security-slo-report.log` |
| Nginx drift and edge audit emit | `ops/runbooks/nginx-edge-drift-response.md` | `npm run verify:nginx-drift && npm run verify:edge-audit-emit` | `/var/log/nginx/error.log` |
| Incus provisioning and OVS drift | `ops/runbooks/incus-provisioning-failure.md` | `npm run verify:kvm-readiness && npm run verify:kvm-health` | `/var/log/uppoint-cloud/incus-provisioning-worker.log` |
| Cron execution failures | `ops/runbooks/cron-failure-response.md` | `systemctl status cron` | `/var/log/syslog` |
| Secret rotation | `ops/runbooks/secret-rotation.md` | `npm run verify:security-gate` | `journalctl -u uppoint-cloud.service` |
| Restore drill | `ops/runbooks/restore-drill.md` | `npm run verify:restore-drill` | `/var/log/uppoint-postgres-restore-drill.log` |

Rules:

- Every new security-sensitive cron, systemd unit, internal route, or provider integration must add or update a runbook row here.
- Runbooks must include detection, immediate containment, diagnosis, recovery, and verification.
- Closed-system defaults remain in force unless an owner-approved exception is documented in the relevant runbook and `ops/README.md`.
