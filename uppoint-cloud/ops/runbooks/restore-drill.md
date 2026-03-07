# PostgreSQL Restore Drill Runbook

## Purpose

Validate backup recoverability without touching production data.

## Preconditions

- `UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE=true`
- `DATABASE_URL` points to production PostgreSQL
- Latest backup exists under `/opt/backups/postgres`

## Safe execution

```bash
cd /opt/uppoint-cloud
sudo ./scripts/restore-drill-db.sh --check-only
```

Full drill (temporary DB only):

```bash
cd /opt/uppoint-cloud
sudo ./scripts/restore-drill-db.sh --execute
```

## Expected result

- A temporary drill database is created, restore is validated, and temporary database is removed.
- Production database is never mutated.
- Log is written to `/var/log/uppoint-postgres-restore-drill.log`.

## Failure response

1. Capture the last log lines:
```bash
tail -n 200 /var/log/uppoint-postgres-restore-drill.log
```
2. Verify latest backup presence and size:
```bash
ls -lah /opt/backups/postgres | tail -n 20
```
3. Re-run check-only mode after fixing root cause.

## Rollback / safety note

- Drill is non-destructive by design when used as documented.
- Never point drill commands to arbitrary database names manually.
