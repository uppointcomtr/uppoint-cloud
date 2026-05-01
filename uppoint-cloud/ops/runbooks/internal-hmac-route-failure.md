# Internal HMAC Route Failure Runbook

Use this when internal loopback routes reject signed service requests or report replay/signature failures.

## Detection

- Audit actions: `internal_*_unauthorized`, `internal_*_replay_blocked`, `internal_*_failed`
- Logs: `journalctl -u uppoint-cloud.service -n 200 --no-pager`
- Gate: `npm run verify:security-gate`

## Immediate Containment

1. Keep the route fail-closed. Do not disable token or signature checks.
2. Confirm the caller is loopback when `INTERNAL_AUTH_TRANSPORT_MODE=loopback-hmac-v1`.
3. Stop only the affected cron/worker if retries are creating noise.

## Diagnosis

```bash
cd /opt/uppoint-cloud
npm run verify:security-gate
journalctl -u uppoint-cloud.service -n 200 --no-pager
tail -n 100 /var/log/uppoint-cloud/incus-provisioning-worker.log
tail -n 100 /var/log/uppoint-cloud/dispatch-notifications.log
```

Check:

- Token environment variable exists for the route family.
- Signing secret exists and matches the caller.
- `x-internal-request-id` is unique per request.
- Request timestamp is inside the accepted skew window.
- Reverse proxy forwards loopback headers only from trusted local paths.

## Recovery

1. Restore the expected env value from secret inventory.
2. Restart only the affected service or cron path.
3. Re-run the route-specific worker once.

## Verification

```bash
npm run verify:security-gate
npm run worker:incus
npm run verify:notification-canary
```

Expected result: no new unauthorized/replay audit actions for the recovered route.
