# Audit Integrity and Anchor Failure Runbook

Use this when audit chain verification, fallback audit logging, or anchor export fails.

## Detection

- Cron log: `/var/log/uppoint-audit-integrity-check.log`
- Anchor export log: `/var/log/uppoint-audit-anchor-export.log`
- Command: `npm run verify:audit-integrity`

## Immediate Containment

1. Keep audit writes enabled.
2. Do not delete or edit audit rows.
3. Preserve `/var/log/uppoint-cloud/audit-fallback.log` and chain state files.

## Diagnosis

```bash
cd /opt/uppoint-cloud
npm run verify:audit-integrity
npm run audit:anchor:export
tail -n 100 /var/log/uppoint-audit-integrity-check.log
tail -n 100 /var/log/uppoint-audit-anchor-export.log
tail -n 100 /var/log/uppoint-cloud/audit-fallback.log
```

Check:

- `AUDIT_LOG_SIGNING_SECRET` and legacy secret state.
- `AUDIT_INTEGRITY_CHAIN_STRICT_SINCE` cutoff.
- Fallback path ownership and free disk.
- Anchor output path permissions.

## Recovery

1. Restore missing env or file permissions.
2. Re-run integrity verification.
3. Export a new local anchor.
4. Keep off-host replication disabled in closed-system mode.

## Verification

```bash
npm run verify:audit-integrity
npm run audit:anchor:export
```

Expected result: chain verification succeeds and anchor output advances locally.
