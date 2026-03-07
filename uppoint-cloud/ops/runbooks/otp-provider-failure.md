# OTP Provider Failure Runbook (SMTP / SMS)

## Purpose

Handle OTP delivery degradation or outage with fail-closed security posture.

## Signals

- Login/register password step succeeds but OTP delivery is delayed/failing.
- `notification_delivery_terminal_failed` audit events increase.
- Security SLO violations include notification failure or auth latency breach.

## Immediate checks

```bash
cd /opt/uppoint-cloud
npm run verify:security-slo
tail -n 200 /var/log/uppoint-cloud/dispatch-notifications.log
```

## Provider connectivity checks

SMTP:
- Validate `UPPOINT_EMAIL_*` values in `/opt/uppoint-cloud/.env`
- Confirm TLS and credentials.

SMS:
- Validate `UPPOINT_SMS_*` values in `/opt/uppoint-cloud/.env`
- Confirm provider API reachability and credential validity.

## Controlled mitigation

1. Keep auth flow fail-closed for invalid/missing OTP (never bypass OTP).
2. Reduce dispatch delay with immediate-dispatch tuning:
   - `NOTIFICATION_OUTBOX_IMMEDIATE_DISPATCH_BATCH_SIZE`
   - `NOTIFICATION_OUTBOX_IMMEDIATE_DISPATCH_THROTTLE_MS`
3. Verify stale lock pressure:
   - `NOTIFICATION_OUTBOX_LOCK_STALE_SECONDS`
   - `NOTIFICATION_OUTBOX_STALE_LOCK_ALERT_THRESHOLD`

## Validation after fix

```bash
cd /opt/uppoint-cloud
npm run lint
npm run typecheck
npm test
npm run build:deploy
npm run verify:security-gate
RUN_E2E=1 E2E_BASE_URL=https://cloud.uppoint.com.tr npm run test:e2e:remote
```

## Rollback

- Revert provider credential/transport changes to last known-good values.
- Restart service and re-run security gate.
