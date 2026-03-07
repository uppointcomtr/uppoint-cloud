# Cron Failure Response Runbook

## Purpose

Provide a deterministic response when scheduled security/ops jobs fail or stop running.

## Scope

- Notification dispatch
- Security SLO report
- Auth abuse check
- Backup / cleanup / restore drill
- Nginx drift / edge audit checks

## Detection

1. Review runtime catalog:
   - `/opt/uppoint-cloud/ops/RUNTIME_SERVICES_AND_CRON.md`
2. Check cron files:
```bash
ls -la /etc/cron.d/uppoint-*
```
3. Check recent logs:
```bash
tail -n 200 /var/log/uppoint-security-slo-report.log
tail -n 200 /var/log/uppoint-auth-abuse-check.log
tail -n 200 /var/log/uppoint-cloud/dispatch-notifications.log
```

## First response

1. Confirm cron service health:
```bash
systemctl status cron
```
2. Confirm script permissions and executable bit.
3. Run failed job manually in controlled mode:
```bash
cd /opt/uppoint-cloud
sudo ./scripts/run-security-slo-report.sh
```

## Root-cause checklist

- Missing/invalid env values in `/opt/uppoint-cloud/.env`
- Script path drift
- Database connectivity issues
- Lock contention or stale lock accumulation
- File permission or ownership mismatch

## Recovery

1. Apply fix.
2. Re-run the job manually.
3. Confirm next scheduled run succeeds.
4. Record incident summary and corrective action in `CHANGELOG.md` (or incident tracker).
