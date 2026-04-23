# Runtime Services and Cron Catalog

This document is the operational inventory of systemd units and cron jobs used by `cloud.uppoint.com.tr`.

Runbook references:
- [Secret Rotation](/opt/uppoint-cloud/ops/runbooks/secret-rotation.md)
- [Restore Drill](/opt/uppoint-cloud/ops/runbooks/restore-drill.md)
- [Cron Failure Response](/opt/uppoint-cloud/ops/runbooks/cron-failure-response.md)
- [OTP Provider Failure](/opt/uppoint-cloud/ops/runbooks/otp-provider-failure.md)

## Systemd services

| Unit | Purpose | Enabled | Notes |
| --- | --- | --- | --- |
| `uppoint-cloud.service` | Runs Next.js production app (`next start`) | yes (production expected) | Uses `/opt/uppoint-cloud/.env` as EnvironmentFile |
| `uppoint-tune.service` | Optional boot-time host tuning | optional | Controlled via `/etc/uppoint-cloud/enable-boot-tune` flag |
| `uppoint-incus-worker.service` | Optional one-shot Incus provisioning worker entrypoint | optional | Runs `/opt/uppoint-cloud/scripts/run-incus-worker.sh`; cron poller is canonical trigger |

Validation commands:

```bash
systemctl status uppoint-cloud.service
systemctl status uppoint-tune.service
systemctl status uppoint-incus-worker.service
```

## Cron jobs (`/etc/cron.d`)

Closed-system policy note:
- Default mode is `UPPOINT_CLOSED_SYSTEM_MODE=true`.
- In this mode, off-host replication jobs must remain disabled.
- Even when closed mode is disabled, off-host replication remains blocked unless `UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=true`.

| File | Schedule | Purpose | Log file | Alert path |
| --- | --- | --- | --- | --- |
| `uppoint-postgres-backup` | `0 2 * * *` | PostgreSQL backup | `/var/log/uppoint-postgres-backup.log` | None (log-only) |
| `uppoint-postgres-restore-drill` | `30 4 * * 0` | PostgreSQL restore drill to temporary DB + email report enqueue (requires `UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE=true`) | `/var/log/uppoint-postgres-restore-drill.log` | Notification outbox (`ops-restore-drill-report`) when email reporting enabled |
| `uppoint-redis-backup` | `40 2 * * *` | Redis backup | `/var/log/uppoint-redis-backup.log` | None (log-only) |
| `uppoint-db-cleanup` | `0 3 * * *` | DB retention cleanup (auth/token tables + instance provisioning event retention) | `/var/log/uppoint-db-cleanup.log` | None (log-only) |
| `uppoint-notification-dispatch` | `* * * * *` | Notification outbox dispatch | `/var/log/uppoint-cloud/dispatch-notifications.log` | Message-level audit (`notification_delivery_terminal_failed`) on terminal failures |
| `uppoint-incus-provisioning` | `* * * * *` | Incus provisioning worker poller (claim -> OVS/VLAN prepare -> instance create/start -> report) | `/var/log/uppoint-cloud/incus-provisioning-worker.log` | Audit actions (`instance_provisioning_started/completed/failed`, `internal_provisioning_*`) |
| `uppoint-notification-canary` | `*/30 * * * *` | Notification canary health check (`probe-only` by default, no outbound email) | `/var/log/uppoint-notification-canary.log` | None (log-only; can be switched to `enqueue-email` only with explicit env mode) |
| `uppoint-audit-integrity-check` | `20 3 * * *` | Audit chain integrity verification | `/var/log/uppoint-audit-integrity-check.log` | None (log-only; investigated via security gate/SLO pipeline) |
| `uppoint-audit-anchor-export` | `40 3 * * *` | Audit chain-head anchor export | `/var/log/uppoint-audit-anchor-export.log` | None in closed-system baseline |
| `uppoint-audit-anchor-replication` | `50 3 * * *` | Off-host WORM replication of latest anchor | `/var/log/uppoint-audit-anchor-replication.log` (optional template; not deployed in closed-system baseline) | Disabled in closed-system baseline; owner-approved exception only |
| `uppoint-auth-abuse-check` | `*/5 * * * *` | Auth abuse threshold monitoring + alerts | `/var/log/uppoint-auth-abuse-check.log` | Local on-host alert sink (`/var/log/uppoint-cloud/security-alerts.log` + syslog), optional Slack/email |
| `uppoint-security-slo-report` | `*/15 * * * *` | Security SLO breach detection from audit + outbox signals | `/var/log/uppoint-security-slo-report.log` | Local on-host alert sink (`/var/log/uppoint-cloud/security-alerts.log` + syslog), optional Slack/email |
| `uppoint-security-gate-weekly` | `30 5 * * 0` | Full local security gate (`verify:security-gate`) + enforced remote read-only smoke (`SECURITY_GATE_REQUIRE_REMOTE_SMOKE=1`) | `/var/log/uppoint-security-gate-weekly.log` | Fails job/log on verification breach; investigate on-call |
| `uppoint-auth-rate-limit-tune` | `*/30 * * * *` | Report-only auth limiter tuning | `/var/log/uppoint-auth-rate-limit-tune.log` | None (report-only) |
| `uppoint-health-probe` | `* * * * *` | Health probe | `/var/log/uppoint-health-probe.log` | None (log-only) |
| `uppoint-nginx-drift-check` | `*/30 * * * *` | Nginx drift verification | `/var/log/uppoint-nginx-drift-check.log` | Local on-host alert sink (`/var/log/uppoint-cloud/security-alerts.log` + syslog), optional Slack/email |
| `uppoint-edge-audit-emit-check` | `*/5 * * * *` | Edge audit emit failure detection | `/var/log/uppoint-cloud/edge-audit-emit-check.log` | Local on-host alert sink (`/var/log/uppoint-cloud/security-alerts.log` + syslog), optional Slack/email |

Validation commands:

```bash
ls -la /etc/cron.d/uppoint-*
tail -n 100 /var/log/uppoint-audit-anchor-replication.log
tail -n 100 /var/log/uppoint-auth-abuse-check.log
tail -n 100 /var/log/uppoint-cloud/incus-provisioning-worker.log
tail -n 100 /var/log/uppoint-notification-canary.log
tail -n 100 /var/log/uppoint-cloud/security-alerts.log
tail -n 100 /var/log/uppoint-security-slo-report.log
tail -n 100 /var/log/uppoint-security-gate-weekly.log
tail -n 100 /var/log/uppoint-postgres-restore-drill.log
```

Deployment note:
- `uppoint-audit-anchor-replication` is intentionally template-only in closed-system baseline.
- Template path: `ops/cron/uppoint-audit-anchor-replication`.
- Deploy it to `/etc/cron.d` only with explicit owner approval for off-host egress.

## Change control

1. Any new cron/service must be added to this file and `ops/README.md`.
2. Log destination must be covered by `ops/logrotate/uppoint-cloud`.
3. Security-sensitive jobs must fail closed and emit diagnosable errors.
4. In closed-system mode, keep external egress jobs disabled unless owner-approved exception is documented.
