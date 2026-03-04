# Production Serving Guide (`cloud.uppoint.com.tr`)

Security hardening roadmap reference:

- [SECURITY_MAXIMIZATION_PLAN.md](/opt/uppoint-cloud/ops/SECURITY_MAXIMIZATION_PLAN.md)
- [Secret Rotation Runbook](/opt/uppoint-cloud/ops/runbooks/secret-rotation.md)
- [Runtime Services and Cron Catalog](/opt/uppoint-cloud/ops/RUNTIME_SERVICES_AND_CRON.md)
- Run security gate before security-sensitive release decisions:
  - `cd /opt/uppoint-cloud && npm run verify:security-gate`

## 1. Application runtime under `/opt/uppoint-cloud`

```bash
cd /opt/uppoint-cloud
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
sudo systemctl restart uppoint-cloud.service
```

`npm run build` only builds the app.
Use `npm run build:deploy` if you want build + service restart in one command.

If you need to keep the service stopped during a maintenance sequence, run:

```bash
npm run build
```

Install the systemd service:

```bash
sudo cp /opt/uppoint-cloud/ops/systemd/uppoint-cloud.service /etc/systemd/system/uppoint-cloud.service
sudo systemctl daemon-reload
sudo systemctl enable --now uppoint-cloud.service
sudo systemctl status uppoint-cloud.service
```

Optional hardware tuning service (boot-time) is now explicit opt-in:

```bash
sudo cp /opt/uppoint-cloud/ops/systemd/uppoint-tune.service /etc/systemd/system/uppoint-tune.service
sudo install -d -m 755 /etc/uppoint-cloud
sudo touch /etc/uppoint-cloud/enable-boot-tune
sudo systemctl daemon-reload
sudo systemctl enable --now uppoint-tune.service
```

Environment values should be provided in `/opt/uppoint-cloud/.env` (not in git), for example:

```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://cloud.uppoint.com.tr
DATABASE_URL=postgresql://...
AUTH_SECRET=replace-with-strong-random-secret
AUTH_OTP_PEPPER=replace-with-separate-strong-random-secret
INTERNAL_AUDIT_TOKEN=replace-with-strong-random-token
INTERNAL_DISPATCH_TOKEN=replace-with-strong-random-token
INTERNAL_AUDIT_SIGNING_SECRET=replace-with-strong-random-secret
INTERNAL_DISPATCH_SIGNING_SECRET=replace-with-strong-random-secret
INTERNAL_AUTH_TRANSPORT_MODE=loopback-hmac-v1
NOTIFICATION_PAYLOAD_SECRET=replace-with-strong-random-secret
AUTH_TRUST_HOST=true
AUTH_BCRYPT_ROUNDS=12
HEALTHCHECK_TOKEN=replace-with-strong-random-token
UPPOINT_ALLOWED_HOSTS=cloud.uppoint.com.tr
UPPOINT_ALLOWED_ORIGINS=https://cloud.uppoint.com.tr
AUDIT_FALLBACK_LOG_PATH=/var/log/uppoint-cloud/audit-fallback.log
AUDIT_FALLBACK_CHAIN_STATE_PATH=/var/lib/uppoint-cloud/audit-fallback-chain.state
AUDIT_ANCHOR_SIGNING_SECRET=replace-with-strong-random-secret
AUDIT_ANCHOR_SIGNING_KEY_ID=prod-kms-key-2026-01
AUDIT_ANCHOR_OUTPUT_PATH=/opt/backups/audit/audit-anchor.jsonl
UPPOINT_CLOSED_SYSTEM_MODE=true
WORM_S3_BUCKET=uppoint-audit-immutable
WORM_S3_REGION=eu-central-1
WORM_S3_PREFIX=cloud.uppoint.com.tr/audit-anchor
WORM_S3_ENDPOINT_URL=
WORM_AUDIT_OBJECT_LOCK_MODE=COMPLIANCE
WORM_AUDIT_RETENTION_DAYS=365
WORM_AUDIT_STORAGE_CLASS=STANDARD_IA
```

This matches the shipped systemd unit (`EnvironmentFile=/opt/uppoint-cloud/.env`).

PostgreSQL deployment note:

- Default architecture uses self-hosted PostgreSQL on the same server.
- `scripts/tune-system.sh` applies PostgreSQL kernel/DB tuning when DATABASE_URL points to a local host (`localhost/127.0.0.1/::1`) or `UPPOINT_ENABLE_LOCAL_PG_TUNING=1` is explicitly set.

### Safe deployment sequence (required)

Use this sequence for every production deploy to avoid stale build/hash mismatches:

```bash
cd /opt/uppoint-cloud
sudo systemctl stop uppoint-cloud.service
mv .next ".next_backup_$(date +%s)" 2>/dev/null || true
npm run build
sudo chown -R www-data:www-data .next
sudo systemctl daemon-reload
sudo systemctl start uppoint-cloud.service
```

Mandatory post-deploy checks:

```bash
systemctl is-active uppoint-cloud.service
curl -I https://cloud.uppoint.com.tr/tr/login
CSS_PATH="$(curl -s https://cloud.uppoint.com.tr/tr/login | sed -n 's/.*href=\"\\(\\/_next\\/static\\/chunks\\/[^\" ]*\\.css\\)\".*/\\1/p' | head -n1)"
curl -I "https://cloud.uppoint.com.tr${CSS_PATH}"
journalctl -u uppoint-cloud.service -n 200 --no-pager | rg -n 'EACCES|Failed to write image to cache' || true
```

Expected results:

- login route returns `200`
- extracted CSS asset returns `200`
- no permission/cache write errors in service logs

## 2. Nginx reverse proxy setup

Note:
- CSP is set in Nginx using per-request nonce (`$request_id`) for both `script-src` and `style-src`.
- Nginx injects nonce into rendered HTML `<script>` and `<style>` tags via `sub_filter`.
- Both `script-src` and `style-src` avoid `unsafe-inline`; inline tags must carry request nonce.

Bootstrap HTTP config (used before certificate issuance):

```bash
sudo mkdir -p /var/www/certbot
sudo cp /opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.bootstrap.conf /etc/nginx/sites-available/cloud.uppoint.com.tr.conf
sudo ln -sfn /etc/nginx/sites-available/cloud.uppoint.com.tr.conf /etc/nginx/sites-enabled/cloud.uppoint.com.tr.conf
sudo nginx -t
sudo systemctl reload nginx
```

Auth API edge rate-limit zone config:

```bash
sudo cp /opt/uppoint-cloud/ops/nginx/uppoint-rate-limit.conf /etc/nginx/conf.d/uppoint-rate-limit.conf
sudo nginx -t
sudo systemctl reload nginx
```

Drift/security verification (must pass after config rollout):

```bash
cd /opt/uppoint-cloud
npm run verify:nginx-drift
```

Rate-limit drift policy modes:

- `RATE_LIMIT_DRIFT_POLICY=warn` (default): tuned rate-limit file differences are warning-only.
- `RATE_LIMIT_DRIFT_POLICY=enforce-baseline`: tuned file must match approved baseline hash.
- `RATE_LIMIT_DRIFT_POLICY=strict-template`: tuned file must match repository template exactly.

Approve tuned file as baseline:

```bash
sudo install -d -m 755 /etc/uppoint-cloud
sudo sha256sum /etc/nginx/conf.d/uppoint-rate-limit.conf | sudo tee /etc/uppoint-cloud/uppoint-rate-limit.conf.sha256 >/dev/null
```

Run drift check with baseline enforcement:

```bash
cd /opt/uppoint-cloud
RATE_LIMIT_DRIFT_POLICY=enforce-baseline npm run verify:nginx-drift
```

## 3. Let's Encrypt issuance

Issue certificate with webroot challenge:

```bash
sudo certbot certonly \
  --webroot -w /var/www/certbot \
  -d cloud.uppoint.com.tr \
  --email you@example.com \
  --agree-tos \
  --no-eff-email \
  --non-interactive
```

Switch to TLS config after successful issuance:

```bash
sudo cp /opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.conf /etc/nginx/sites-available/cloud.uppoint.com.tr.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Certificate renewal

Certbot installs a renewal timer on most distributions:

```bash
sudo systemctl status certbot.timer
```

Test renewal path safely:

```bash
sudo certbot renew --dry-run
```

If needed, configure a deploy hook to reload Nginx after renew:

```bash
sudo certbot renew --deploy-hook "systemctl reload nginx"
```

## 5. Known issuance blockers

Automatic certificate issuance will fail if any of the following are not ready:

- DNS A/AAAA record for `cloud.uppoint.com.tr` does not resolve to this server.
- Inbound TCP `80` and `443` are blocked by firewall/security groups.
- Another service already occupies `80` during HTTP challenge.
- Nginx config does not expose `/.well-known/acme-challenge/` from `/var/www/certbot`.

## 6. Redis rate-limit hardening

Install and enable Redis:

```bash
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
```

Apply Redis hardening config:

```bash
sudo mkdir -p /etc/redis/redis.conf.d
sudo cp /opt/uppoint-cloud/ops/redis/99-uppoint-cloud.conf /etc/redis/redis.conf.d/99-uppoint-cloud.conf
grep -q '^include /etc/redis/redis.conf.d/\*\.conf$' /etc/redis/redis.conf || echo 'include /etc/redis/redis.conf.d/*.conf' | sudo tee -a /etc/redis/redis.conf
sudo systemctl restart redis-server
redis-cli CONFIG GET appendonly maxmemory maxmemory-policy appendfsync
```

Set app environment for local Redis rate limiting:

```bash
echo 'RATE_LIMIT_REDIS_URL=redis://127.0.0.1:6379' | sudo tee -a /opt/uppoint-cloud/.env
sudo systemctl restart uppoint-cloud.service
```

## 7. Fail2ban auth abuse jail

```bash
sudo cp /opt/uppoint-cloud/ops/fail2ban/nginx-uppoint-auth.conf /etc/fail2ban/filter.d/nginx-uppoint-auth.conf
sudo cp /opt/uppoint-cloud/ops/fail2ban/uppoint-auth.local /etc/fail2ban/jail.d/uppoint-auth.local
sudo systemctl restart fail2ban
sudo fail2ban-client status nginx-uppoint-auth
```

## 8. PostgreSQL backup + DB cleanup automation

Install cron entries:

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-postgres-backup /etc/cron.d/uppoint-postgres-backup
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-postgres-restore-drill /etc/cron.d/uppoint-postgres-restore-drill
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-db-cleanup /etc/cron.d/uppoint-db-cleanup
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-notification-dispatch /etc/cron.d/uppoint-notification-dispatch
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-audit-integrity-check /etc/cron.d/uppoint-audit-integrity-check
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-audit-anchor-export /etc/cron.d/uppoint-audit-anchor-export
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-auth-abuse-check /etc/cron.d/uppoint-auth-abuse-check
sudo chmod 644 /etc/cron.d/uppoint-postgres-backup /etc/cron.d/uppoint-postgres-restore-drill /etc/cron.d/uppoint-db-cleanup /etc/cron.d/uppoint-notification-dispatch /etc/cron.d/uppoint-audit-integrity-check /etc/cron.d/uppoint-audit-anchor-export /etc/cron.d/uppoint-auth-abuse-check
```

`uppoint-notification-dispatch` uses least-privilege execution:
- root-owned cron entry keeps lock/log ownership
- dispatcher process runs as `www-data` via `runuser`

Run manual tests:

```bash
sudo /opt/uppoint-cloud/scripts/backup-db.sh
sudo /opt/uppoint-cloud/scripts/restore-drill-db.sh --check-only
sudo /opt/uppoint-cloud/scripts/cleanup-db.sh
sudo /opt/uppoint-cloud/scripts/dispatch-notifications.sh
sudo /opt/uppoint-cloud/scripts/verify-audit-integrity.sh
sudo /opt/uppoint-cloud/scripts/export-audit-anchor.sh
sudo /opt/uppoint-cloud/scripts/run-auth-abuse-check.sh
ls -lah /opt/backups/postgres
```

`cleanup-db.sh` audit retention behavior:

- `AUDIT_LOG_ARCHIVE_BEFORE_DELETE=true` (default) exports old audit rows to JSONL archive before deletion.
- archive target defaults to `/opt/backups/audit` and can be overridden with `AUDIT_LOG_ARCHIVE_DIR`.

`dispatch-notifications.sh` reads `INTERNAL_DISPATCH_TOKEN` and
`INTERNAL_DISPATCH_SIGNING_SECRET` from `/opt/uppoint-cloud/.env` and sends:

- `x-internal-request-id` (single-use request nonce)
- `x-internal-dispatch-token`
- `x-internal-request-ts`
- `x-internal-request-signature` (HMAC-SHA256 canonical request signature)

Production guard:

- `INTERNAL_AUTH_TRANSPORT_MODE=loopback-hmac-v1` is the default and must be present on signed internal requests via `x-internal-transport`.
- In production + `loopback-hmac-v1`, internal routes require loopback source (`127.0.0.1` / `::1`) in addition to token + signature checks.
- For staged mTLS rollout use `INTERNAL_AUTH_TRANSPORT_MODE=mtls-hmac-v1` only after Nginx is configured to set trusted client-cert headers (`x-ssl-client-verify`, `x-ssl-client-serial`) for internal calls.
- keep dispatcher traffic local (`--resolve cloud.uppoint.com.tr:443:127.0.0.1` default in script).
- `dispatch-notifications.sh` blocks production loopback-mode remote target overrides unless both of these are explicitly set for an owner-approved exception:
  - `UPPOINT_ALLOW_INTERNAL_DISPATCH_REMOTE_OVERRIDE=true`
  - `UPPOINT_CLOSED_SYSTEM_MODE=false`

PostgreSQL restore drill:
- `restore-drill-db.sh --check-only` validates latest backup artifact and checksum without creating a database.
- `restore-drill-db.sh --execute --confirm` runs a full restore drill into a temporary database and drops it afterwards.

`verify-audit-integrity.sh` performs read-only integrity validation for `AuditLog.metadata.integrity` chain:
- allows legacy rows before first integrity-enabled record
- requires contiguous `previousHash -> hash` linkage once integrity chain starts
- verifies `v2` rows with cryptographic HMAC recomputation
- treats `v1` rows as legacy continuity-only (chain enforced, hash recomputation skipped)
- fails on missing/invalid chain metadata after cutover

`replicate-audit-anchor.sh` pushes the latest JSONL anchor record to off-host S3 object-lock storage:
- requires `aws` cli and valid cloud credentials (IAM user/role)
- uploads with `ObjectLockMode` (`COMPLIANCE` or `GOVERNANCE`) and retention window
- verifies object lock metadata via `head-object`
- deduplicates by last replicated anchor hash (`/var/lib/uppoint-cloud/audit-anchor-replication.state`)

Closed-system default:
- Keep `UPPOINT_CLOSED_SYSTEM_MODE=true`.
- Do not install `uppoint-audit-anchor-replication` cron.
- `replicate-audit-anchor.sh` exits with skip in closed mode.
- Enable off-host replication only with explicit owner approval and documented exception.

## 9. Redis backup automation

Install cron entry:

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-redis-backup /etc/cron.d/uppoint-redis-backup
sudo chmod 644 /etc/cron.d/uppoint-redis-backup
```

Run a manual backup test:

```bash
sudo /opt/uppoint-cloud/scripts/backup-redis.sh
ls -lah /opt/backups/redis
```

## 10. Auth rate-limit auto tuning + report

Run analysis manually (report only):

```bash
sudo /opt/uppoint-cloud/scripts/tune-auth-rate-limit.sh
cat /var/log/uppoint-cloud/auth-rate-limit/auth-rate-limit-latest.md
```

Run with apply mode (safe tuning + nginx reload):

```bash
sudo /opt/uppoint-cloud/scripts/tune-auth-rate-limit.sh --apply --tail-lines 30000 --min-sample 150
sudo nginx -t
```

Install periodic tuning cron:

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-auth-rate-limit-tune /etc/cron.d/uppoint-auth-rate-limit-tune
sudo chmod 644 /etc/cron.d/uppoint-auth-rate-limit-tune
```

Operational notes:

- Script updates only:
  - `/etc/nginx/conf.d/uppoint-rate-limit.conf` (`rate=...r/m`)
  - `/etc/nginx/sites-available/cloud.uppoint.com.tr.conf` (`burst=...`)
- Tuning is step-limited each run to avoid oscillation (`rate ±20`, `burst ±15`).
- On config test failure, both files are rolled back from timestamped backups.
- Generated reports are written to:
  - `/var/log/uppoint-cloud/auth-rate-limit/auth-rate-limit-latest.md`
  - `/var/log/uppoint-cloud/auth-rate-limit/auth-rate-limit-latest.json`
- Cron task `ops/cron/uppoint-auth-rate-limit-tune` is report-only by default (no `--apply`).

## 11. Log rotation for ops jobs

Install the managed logrotate template:

```bash
sudo cp /opt/uppoint-cloud/ops/logrotate/uppoint-cloud /etc/logrotate.d/uppoint-cloud
sudo chmod 644 /etc/logrotate.d/uppoint-cloud
```

Validate syntax and behavior:

```bash
sudo logrotate -d /etc/logrotate.d/uppoint-cloud
```

Note:

- Template includes `su root adm` to prevent insecure-permission skips on distributions where `/var/log` is group-writable.

Covered logs:

- `/var/log/uppoint-postgres-backup.log`
- `/var/log/uppoint-db-cleanup.log`
- `/var/log/uppoint-redis-backup.log`
- `/var/log/uppoint-auth-rate-limit-tune.log`
- `/var/log/uppoint-health-probe.log`
- `/var/log/uppoint-cloud/dispatch-notifications.log`
- `/var/log/uppoint-nginx-drift-check.log`
- `/var/log/uppoint-audit-integrity-check.log`
- `/var/log/uppoint-cloud/audit-fallback.log`
- `/var/log/postgresql/*.log`

## 12. Tokenized health probe (Nginx + local monitoring)

Sync app `HEALTHCHECK_TOKEN` from `.env` into an Nginx snippet and reload:

```bash
sudo /opt/uppoint-cloud/scripts/sync-healthcheck-token-to-nginx.sh
```

The script writes:

- `/etc/nginx/snippets/uppoint-health-token.conf`

Nginx serves a local-only endpoint:

- `https://cloud.uppoint.com.tr/healthz`

Behavior:

- only loopback clients are allowed (`127.0.0.1`, `::1`)
- Nginx injects `x-health-token` to upstream `/api/health`

Manual probe test:

```bash
sudo /opt/uppoint-cloud/scripts/health-probe.sh
```

Install periodic local probe:

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-health-probe /etc/cron.d/uppoint-health-probe
sudo chmod 644 /etc/cron.d/uppoint-health-probe
```

## 13. Restore procedures (manual, guarded)

PostgreSQL restore (requires explicit confirmation):

```bash
sudo /opt/uppoint-cloud/scripts/restore-db.sh /opt/backups/postgres/backup-file.sql.gz --confirm
```

Redis restore (requires explicit confirmation):

```bash
sudo /opt/uppoint-cloud/scripts/restore-redis.sh /opt/backups/redis/backup-file.tar.gz --confirm
```

Both restore scripts verify `*.sha256` checksums by default.
Legacy unsigned backups can be restored only with explicit override:

```bash
sudo /opt/uppoint-cloud/scripts/restore-db.sh /opt/backups/postgres/legacy.sql.gz --confirm --allow-unsigned
sudo /opt/uppoint-cloud/scripts/restore-redis.sh /opt/backups/redis/legacy.tar.gz --confirm --allow-unsigned
```

PostgreSQL restore also creates a pre-restore backup snapshot before modifying live data.

## 14. Nginx config drift check

Verify deployed Nginx config files match repository templates:

```bash
sudo /opt/uppoint-cloud/scripts/check-nginx-config-drift.sh
```

Site config is accepted if it matches either:
- `ops/nginx/cloud.uppoint.com.tr.bootstrap.conf` (pre-certificate)
- `ops/nginx/cloud.uppoint.com.tr.conf` (TLS)

Rate-limit file note:
- `/etc/nginx/conf.d/uppoint-rate-limit.conf` may diverge after auto-tuning runs and is reported as warning by default.
- Set `RATE_LIMIT_DRIFT_POLICY=enforce-baseline` to require match against `/etc/uppoint-cloud/uppoint-rate-limit.conf.sha256`.
- Set `RATE_LIMIT_DRIFT_POLICY=strict-template` (or legacy `STRICT_RATE_LIMIT_TEMPLATE=1`) to treat template divergence as hard failure.

Periodic enforcement (`enforce-baseline`, every 30 min):

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-nginx-drift-check /etc/cron.d/uppoint-nginx-drift-check
sudo chmod 644 /etc/cron.d/uppoint-nginx-drift-check
```

Log path:
- `/var/log/uppoint-nginx-drift-check.log`

Optional alert channels (`/opt/uppoint-cloud/.env`):

```bash
UPPOINT_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...
UPPOINT_ALERT_EMAIL_TO=ops@uppoint.com.tr
UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES=60
```

Alert behavior:
- failure output is matched against drift fail patterns and appended to `/var/log/uppoint-nginx-drift-check.log`
- Slack alert is sent when `UPPOINT_ALERT_SLACK_WEBHOOK` is configured
- Email alert is queued into `NotificationOutbox` when `UPPOINT_ALERT_EMAIL_TO` is configured
- repeated identical failures are suppressed during cooldown window

Incident/playbook (drift check fail):
1. Confirm current and baseline hash mismatch:
```bash
sha256sum /etc/nginx/conf.d/uppoint-rate-limit.conf
cat /etc/uppoint-cloud/uppoint-rate-limit.conf.sha256
```
2. If change is approved tuning, refresh baseline:
```bash
sudo sha256sum /etc/nginx/conf.d/uppoint-rate-limit.conf | sudo tee /etc/uppoint-cloud/uppoint-rate-limit.conf.sha256 >/dev/null
RATE_LIMIT_DRIFT_POLICY=enforce-baseline /opt/uppoint-cloud/scripts/check-nginx-config-drift.sh
```
3. If change is unapproved, rollback from repo template and reload:
```bash
sudo cp /opt/uppoint-cloud/ops/nginx/uppoint-rate-limit.conf /etc/nginx/conf.d/uppoint-rate-limit.conf
sudo nginx -t && sudo systemctl reload nginx
RATE_LIMIT_DRIFT_POLICY=enforce-baseline /opt/uppoint-cloud/scripts/check-nginx-config-drift.sh
```

## 14.1 Edge audit emit failure monitoring

Monitor `uppoint-cloud.service` logs for `[edge-audit-emit] failed` and alert via Slack/email channels.

Manual check:

```bash
sudo /opt/uppoint-cloud/scripts/run-edge-audit-emit-check.sh
```

Install periodic checker (every 5 minutes):

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-edge-audit-emit-check /etc/cron.d/uppoint-edge-audit-emit-check
sudo chmod 644 /etc/cron.d/uppoint-edge-audit-emit-check
```

Log path:
- `/var/log/uppoint-cloud/edge-audit-emit-check.log`

Optional alert tuning in `/opt/uppoint-cloud/.env`:

```bash
UPPOINT_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...
UPPOINT_ALERT_EMAIL_TO=semih.akbag@uppoint.com.tr
UPPOINT_EDGE_AUDIT_ALERT_LOOKBACK_MINUTES=15
UPPOINT_EDGE_AUDIT_ALERT_COOLDOWN_MINUTES=60
```

Alert behavior:
- scans recent `uppoint-cloud.service` journal window for `[edge-audit-emit] failed`
- sends Slack alert when `UPPOINT_ALERT_SLACK_WEBHOOK` is configured
- queues encrypted email into `NotificationOutbox` when `UPPOINT_ALERT_EMAIL_TO` is configured
- suppresses repeated identical alerts during cooldown window

## 15. Restore drill (staging rehearsal)

PostgreSQL drill (recommended on staging or temporary drill database):

```bash
cd /opt/uppoint-cloud
LATEST_BACKUP="$(ls -1t /opt/backups/postgres/*.sql.gz | head -n1)"
DRILL_DB="uppoint_cloud_restore_drill_$(date +%Y%m%d%H%M%S)"
DATABASE_URL_VALUE="$(grep -E '^DATABASE_URL=' .env | tail -n1 | cut -d '=' -f2-)"
ADMIN_URL="$(DATABASE_URL="$DATABASE_URL_VALUE" node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname="/postgres"; console.log(u.toString())')"
DRILL_URL="$(DATABASE_URL="$DATABASE_URL_VALUE" node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname="/" + process.argv[1]; console.log(u.toString())' "$DRILL_DB")"
psql "$ADMIN_URL" -c "CREATE DATABASE \"$DRILL_DB\";"
DATABASE_URL="$DRILL_URL" ./scripts/restore-db.sh "$LATEST_BACKUP" --confirm
psql "$DRILL_URL" -Atqc 'SELECT COUNT(*) FROM "User";'
psql "$ADMIN_URL" -c "DROP DATABASE \"$DRILL_DB\";"
```

Redis drill (non-disruptive, temporary local instance):

```bash
LATEST_REDIS_BACKUP="$(ls -1t /opt/backups/redis/*.tar.gz | head -n1)"
TMP_DIR="$(mktemp -d)"
tar -xzf "$LATEST_REDIS_BACKUP" -C "$TMP_DIR"
redis-server --port 0 --unixsocket "$TMP_DIR/redis-drill.sock" --unixsocketperm 700 --save "" --appendonly no --dir "$TMP_DIR" --dbfilename dump.rdb --daemonize yes --pidfile "$TMP_DIR/redis-drill.pid" --logfile "$TMP_DIR/redis-drill.log"
redis-cli -s "$TMP_DIR/redis-drill.sock" ping
redis-cli -s "$TMP_DIR/redis-drill.sock" shutdown nosave
rm -rf "$TMP_DIR"
```

## 16. Internal token rotation runbook (`INTERNAL_AUDIT_TOKEN`, `INTERNAL_DISPATCH_TOKEN`)

These tokens secure internal-only endpoints:

- `INTERNAL_AUDIT_TOKEN` -> `POST /api/internal/audit/security-event`
- `INTERNAL_DISPATCH_TOKEN` -> `POST /api/internal/notifications/dispatch`

Current implementation is single-active-token (no dual-token grace window), so rotation is a direct cutover.

### 16.1 Prepare new tokens

```bash
NEW_INTERNAL_AUDIT_TOKEN="$(openssl rand -hex 32)"
NEW_INTERNAL_DISPATCH_TOKEN="$(openssl rand -hex 32)"
```

### 16.2 Back up and update `.env`

```bash
sudo cp /opt/uppoint-cloud/.env "/opt/uppoint-cloud/.env.bak.$(date +%Y%m%d%H%M%S)"
sudo sed -i "s#^INTERNAL_AUDIT_TOKEN=.*#INTERNAL_AUDIT_TOKEN=${NEW_INTERNAL_AUDIT_TOKEN}#" /opt/uppoint-cloud/.env
sudo sed -i "s#^INTERNAL_DISPATCH_TOKEN=.*#INTERNAL_DISPATCH_TOKEN=${NEW_INTERNAL_DISPATCH_TOKEN}#" /opt/uppoint-cloud/.env
```

If keys do not exist yet, append once:

```bash
grep -q '^INTERNAL_AUDIT_TOKEN=' /opt/uppoint-cloud/.env || echo "INTERNAL_AUDIT_TOKEN=${NEW_INTERNAL_AUDIT_TOKEN}" | sudo tee -a /opt/uppoint-cloud/.env
grep -q '^INTERNAL_DISPATCH_TOKEN=' /opt/uppoint-cloud/.env || echo "INTERNAL_DISPATCH_TOKEN=${NEW_INTERNAL_DISPATCH_TOKEN}" | sudo tee -a /opt/uppoint-cloud/.env
```

### 16.3 Restart service and verify

```bash
cd /opt/uppoint-cloud
sudo systemctl restart uppoint-cloud.service
sudo systemctl is-active --quiet uppoint-cloud.service
sudo /opt/uppoint-cloud/scripts/dispatch-notifications.sh
```

Expected:
- service is `active`
- dispatch script returns `OK`

### 16.4 Post-rotation checks

```bash
journalctl -u uppoint-cloud.service -n 200 --no-pager | rg -n "INTERNAL_AUDIT_TOKEN|INTERNAL_DISPATCH_TOKEN|UNAUTHORIZED|INVALID_BODY" || true
tail -n 100 /var/log/uppoint-cloud/dispatch-notifications.log
```

### 16.5 Rollback

If internal calls fail after rotation:

```bash
sudo cp /opt/uppoint-cloud/.env.bak.<timestamp> /opt/uppoint-cloud/.env
sudo systemctl restart uppoint-cloud.service
sudo /opt/uppoint-cloud/scripts/dispatch-notifications.sh
```
