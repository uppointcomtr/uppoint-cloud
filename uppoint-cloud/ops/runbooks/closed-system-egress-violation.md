# Closed-System Egress Violation Runbook

Use this when a setting, script, or cron job attempts off-host data egress without owner approval.

## Detection

- `UPPOINT_CLOSED_SYSTEM_MODE=true` with external sink variables set.
- Security gate failure.
- Unexpected outbound webhook, S3/WORM, Slack, Upstash, or remote Incus endpoint configuration.

## Immediate Containment

1. Disable the external sink variable or cron template.
2. Keep local audit, backup, and alert sinks enabled.
3. Preserve logs and environment snapshots for review.

## Diagnosis

```bash
cd /opt/uppoint-cloud
npm run verify:security-gate
env | sort | rg 'UPSTASH|WORM|SLACK|WEBHOOK|INCUS_ENDPOINT|AUDIT_ENDPOINT|CLOSED_SYSTEM'
ls -la /etc/cron.d/uppoint-*
```

Check:

- `UPPOINT_CLOSED_SYSTEM_MODE=true`
- `UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=false`
- `UPSTASH_REDIS_REST_URL` and token are unset
- `INTERNAL_AUDIT_ENDPOINT_URL` is loopback
- `INCUS_ENDPOINT` is loopback when configured

## Recovery

1. Restore closed-system env defaults.
2. Remove unauthorized cron deployment for off-host replication.
3. Restart affected service.
4. Record the exception attempt in the findings register if policy drift reached production.

## Verification

```bash
npm run verify:security-gate
npm run verify:nginx-drift
```
