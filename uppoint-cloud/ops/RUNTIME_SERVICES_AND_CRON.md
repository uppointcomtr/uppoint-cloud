# Runtime Services and Cron Catalog

This document is the operational inventory of systemd units and cron jobs used by `cloud.uppoint.com.tr`.

## Systemd services

| Unit | Purpose | Enabled | Notes |
| --- | --- | --- | --- |
| `uppoint-cloud.service` | Runs Next.js production app (`next start`) | yes (production expected) | Uses `/opt/uppoint-cloud/.env` as EnvironmentFile |
| `uppoint-tune.service` | Optional boot-time host tuning | optional | Controlled via `/etc/uppoint-cloud/enable-boot-tune` flag |

Validation commands:

```bash
systemctl status uppoint-cloud.service
systemctl status uppoint-tune.service
```

## Cron jobs (`/etc/cron.d`)

| File | Schedule | Purpose | Log file |
| --- | --- | --- | --- |
| `uppoint-postgres-backup` | `0 2 * * *` | PostgreSQL backup | `/var/log/uppoint-postgres-backup.log` |
| `uppoint-redis-backup` | `40 2 * * *` | Redis backup | `/var/log/uppoint-redis-backup.log` |
| `uppoint-db-cleanup` | as configured | DB retention cleanup | `/var/log/uppoint-db-cleanup.log` |
| `uppoint-notification-dispatch` | every minute | Notification outbox dispatch | `/var/log/uppoint-cloud/dispatch-notifications.log` |
| `uppoint-audit-integrity-check` | `20 3 * * *` | Audit chain integrity verification | `/var/log/uppoint-audit-integrity-check.log` |
| `uppoint-audit-anchor-export` | `40 3 * * *` | Audit chain-head anchor export | `/var/log/uppoint-audit-anchor-export.log` |
| `uppoint-audit-anchor-replication` | `50 3 * * *` | Off-host WORM replication of latest anchor | `/var/log/uppoint-audit-anchor-replication.log` |
| `uppoint-auth-abuse-check` | `*/5 * * * *` | Auth abuse threshold monitoring + alerts | `/var/log/uppoint-auth-abuse-check.log` |
| `uppoint-auth-rate-limit-tune` | daily | Report-only auth limiter tuning | `/var/log/uppoint-auth-rate-limit-tune.log` |
| `uppoint-health-probe` | periodic | Health probe | `/var/log/uppoint-health-probe.log` |
| `uppoint-nginx-drift-check` | periodic | Nginx drift verification | `/var/log/uppoint-nginx-drift-check.log` |
| `uppoint-edge-audit-emit-check` | periodic | Edge audit emit failure detection | `/var/log/uppoint-cloud/edge-audit-emit-check.log` |

Validation commands:

```bash
ls -la /etc/cron.d/uppoint-*
tail -n 100 /var/log/uppoint-audit-anchor-replication.log
tail -n 100 /var/log/uppoint-auth-abuse-check.log
```

## Change control

1. Any new cron/service must be added to this file and `ops/README.md`.
2. Log destination must be covered by `ops/logrotate/uppoint-cloud`.
3. Security-sensitive jobs must fail closed and emit diagnosable errors.
