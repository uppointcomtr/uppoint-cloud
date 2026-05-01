# Notification Canary and Security SLO Failure Runbook

Use this when canary checks, auth notification latency, or security SLO reports fail.

## Detection

- Cron logs:
  - `/var/log/uppoint-notification-canary.log`
  - `/var/log/uppoint-security-slo-report.log`
- Commands:
  - `npm run verify:notification-canary`
  - `npm run verify:security-slo`

## Immediate Containment

1. Keep OTP endpoints fail-closed.
2. Do not lower SLO thresholds to hide the incident.
3. Check provider availability before retry storms build up.

## Diagnosis

```bash
cd /opt/uppoint-cloud
npm run verify:notification-canary
npm run verify:security-slo
tail -n 100 /var/log/uppoint-notification-canary.log
tail -n 100 /var/log/uppoint-security-slo-report.log
tail -n 100 /var/log/uppoint-cloud/dispatch-notifications.log
```

Check:

- SMTP/SMS provider credentials and TLS settings.
- Notification outbox stale locks.
- Auth-scoped notification latency p95.
- Terminal delivery failure count.

## Recovery

1. Restore provider configuration or intentionally switch provider backend.
2. Run notification dispatcher once.
3. Re-run canary and SLO checks.
4. Keep the incident visible until auth OTP delivery is healthy.

## Verification

```bash
npm run verify:notification-canary
npm run verify:security-slo
```
