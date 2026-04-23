# Production Serving Guide (`cloud.uppoint.com.tr`)

Security hardening roadmap reference:

- [SECURITY_MAXIMIZATION_PLAN.md](/opt/uppoint-cloud/ops/SECURITY_MAXIMIZATION_PLAN.md)
- [Secret Rotation Runbook](/opt/uppoint-cloud/ops/runbooks/secret-rotation.md)
- [Restore Drill Runbook](/opt/uppoint-cloud/ops/runbooks/restore-drill.md)
- [Cron Failure Response Runbook](/opt/uppoint-cloud/ops/runbooks/cron-failure-response.md)
- [OTP Provider Failure Runbook](/opt/uppoint-cloud/ops/runbooks/otp-provider-failure.md)
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

### 1.1 Fresh host restore from `v1.0.0` tag (schema-only)

Use this when you need to recreate the V1 baseline on a different host without carrying production data.

```bash
cd /opt
git clone git@github.com:uppointcomtr/uppoint-cloud.git
cd uppoint-cloud/uppoint-cloud
git checkout v1.0.0
cp /opt/uppoint-cloud/.env .env
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm run build:deploy
```

Release bundle assets for verification:
- `releases/v1.0.0/RELEASE_MANIFEST_v1.0.0.md`
- `releases/v1.0.0/checksums.txt`

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

Optional Incus worker service (manual one-shot trigger surface):

```bash
sudo cp /opt/uppoint-cloud/ops/systemd/uppoint-incus-worker.service /etc/systemd/system/uppoint-incus-worker.service
sudo systemctl daemon-reload
sudo systemctl start uppoint-incus-worker.service
sudo systemctl status uppoint-incus-worker.service
```

Environment values should be provided in `/opt/uppoint-cloud/.env` (not in git).

Closed-system baseline example (default policy):

```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://cloud.uppoint.com.tr
DATABASE_URL=postgresql://...
AUTH_SECRET=replace-with-strong-random-secret
AUTH_OTP_PEPPER=replace-with-separate-strong-random-secret
INTERNAL_AUDIT_TOKEN=replace-with-strong-random-token
INTERNAL_DISPATCH_TOKEN=replace-with-strong-random-token
INTERNAL_PROVISIONING_TOKEN=replace-with-strong-random-token
INTERNAL_AUDIT_SIGNING_SECRET=replace-with-strong-random-secret
INTERNAL_DISPATCH_SIGNING_SECRET=replace-with-strong-random-secret
INTERNAL_PROVISIONING_SIGNING_SECRET=replace-with-strong-random-secret
INTERNAL_AUTH_TRANSPORT_MODE=loopback-hmac-v1
INCUS_SOCKET_PATH=/var/lib/incus/unix.socket
INCUS_ENDPOINT=
KVM_WORKER_BATCH_SIZE=10
KVM_WORKER_LOCK_STALE_SECONDS=180
KVM_OVS_BRIDGE_PREFIX=upkvm
KVM_VLAN_RANGE=2000-2999
NOTIFICATION_PAYLOAD_SECRET=replace-with-strong-random-secret
AUTH_TRUST_HOST=true
AUTH_BCRYPT_ROUNDS=12
HEALTHCHECK_TOKEN=replace-with-strong-random-token
UPPOINT_ALLOWED_HOSTS=cloud.uppoint.com.tr
UPPOINT_ALLOWED_ORIGINS=https://cloud.uppoint.com.tr
RATE_LIMIT_REDIS_URL=redis://127.0.0.1:6379
AUDIT_FALLBACK_LOG_PATH=/var/log/uppoint-cloud/audit-fallback.log
AUDIT_FALLBACK_CHAIN_STATE_PATH=/var/lib/uppoint-cloud/audit-fallback-chain.state
AUDIT_LOG_SIGNING_SECRET=replace-with-strong-random-secret
AUDIT_LOG_SIGNING_SECRET_LEGACY=
AUDIT_INTEGRITY_CHAIN_STRICT_SINCE=2026-03-07T00:00:00Z
AUDIT_ANCHOR_SIGNING_SECRET=replace-with-strong-random-secret
AUDIT_ANCHOR_SIGNING_KEY_ID=prod-kms-key-2026-01
AUDIT_ANCHOR_OUTPUT_PATH=/opt/backups/audit/audit-anchor.jsonl
NOTIFICATION_OUTBOX_LOCK_STALE_SECONDS=120
NOTIFICATION_OUTBOX_STALE_LOCK_ALERT_THRESHOLD=25
NOTIFICATION_OUTBOX_IMMEDIATE_DISPATCH_BATCH_SIZE=10
NOTIFICATION_OUTBOX_IMMEDIATE_DISPATCH_THROTTLE_MS=5000
SECURITY_SLO_MAX_AUTH_NOTIFICATION_P95_SECONDS=20
SECURITY_SLO_MIN_AUTH_NOTIFICATION_SAMPLE=10
SECURITY_SLO_WARN_ON_LOW_AUTH_NOTIFICATION_SAMPLE=true
UPPOINT_EMAIL_POOL_MAX_CONNECTIONS=5
UPPOINT_EMAIL_POOL_MAX_MESSAGES=100
UPPOINT_CLOSED_SYSTEM_MODE=true
UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=false
UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE=true
UPPOINT_RESTORE_DRILL_EMAIL_ENABLED=true
UPPOINT_RESTORE_DRILL_EMAIL_TO=semih.akbag@uppoint.com.tr
```

Owner-approved external exception example (off-host replication explicitly enabled):

```bash
UPPOINT_CLOSED_SYSTEM_MODE=false
UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=true
UPSTASH_REDIS_REST_URL=https://tenant.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-upstash-token
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
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-incus-provisioning /etc/cron.d/uppoint-incus-provisioning
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-notification-canary /etc/cron.d/uppoint-notification-canary
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-audit-integrity-check /etc/cron.d/uppoint-audit-integrity-check
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-audit-anchor-export /etc/cron.d/uppoint-audit-anchor-export
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-auth-abuse-check /etc/cron.d/uppoint-auth-abuse-check
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-security-slo-report /etc/cron.d/uppoint-security-slo-report
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-security-gate-weekly /etc/cron.d/uppoint-security-gate-weekly
sudo chmod 644 /etc/cron.d/uppoint-postgres-backup /etc/cron.d/uppoint-postgres-restore-drill /etc/cron.d/uppoint-db-cleanup /etc/cron.d/uppoint-notification-dispatch /etc/cron.d/uppoint-incus-provisioning /etc/cron.d/uppoint-notification-canary /etc/cron.d/uppoint-audit-integrity-check /etc/cron.d/uppoint-audit-anchor-export /etc/cron.d/uppoint-auth-abuse-check /etc/cron.d/uppoint-security-slo-report /etc/cron.d/uppoint-security-gate-weekly
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
sudo /opt/uppoint-cloud/scripts/run-incus-worker.sh
sudo /opt/uppoint-cloud/scripts/run-notification-canary.sh
sudo /opt/uppoint-cloud/scripts/verify-audit-integrity.sh
sudo /opt/uppoint-cloud/scripts/export-audit-anchor.sh
sudo /opt/uppoint-cloud/scripts/run-auth-abuse-check.sh
sudo /opt/uppoint-cloud/scripts/run-security-slo-report.sh
ls -lah /opt/backups/postgres
```

Auth abuse alert channels:
- In `UPPOINT_CLOSED_SYSTEM_MODE=true`, external Slack/email alert delivery is intentionally skipped.
- Local on-host alert evidence is always written to `/var/log/uppoint-cloud/security-alerts.log` and syslog (`logger -t uppoint-security-alert`).
- Optional path override: `UPPOINT_LOCAL_SECURITY_ALERT_LOG_PATH`.

`cleanup-db.sh` audit retention behavior:

- `AUDIT_LOG_ARCHIVE_BEFORE_DELETE=true` (default) exports old audit rows to JSONL archive before deletion.
- archive target defaults to `/opt/backups/audit` and can be overridden with `AUDIT_LOG_ARCHIVE_DIR`.
- append-only `InstanceProvisioningEvent` rows are cleaned by retention window (`INSTANCE_PROVISIONING_EVENT_RETENTION_DAYS`, default `90`).

`dispatch-notifications.sh` reads `INTERNAL_DISPATCH_TOKEN` and
`INTERNAL_DISPATCH_SIGNING_SECRET` from `/opt/uppoint-cloud/.env` and sends:

- `x-internal-request-id` (single-use request nonce)
- `x-internal-dispatch-token`
- `x-internal-request-ts`
- `x-internal-request-signature` (HMAC-SHA256 canonical request signature)

`run-incus-worker.sh` reads `INTERNAL_PROVISIONING_TOKEN` and
`INTERNAL_PROVISIONING_SIGNING_SECRET` from `/opt/uppoint-cloud/.env` and signs
calls to:

- `POST /api/internal/instances/provisioning/claim`
- `POST /api/internal/instances/provisioning/report`

Worker runtime defaults:

- `KVM_WORKER_BATCH_SIZE=10`
- `KVM_WORKER_LOCK_STALE_SECONDS=180`
- `KVM_OVS_BRIDGE_PREFIX=upkvm`
- `KVM_VLAN_RANGE=2000-2999`
- `INCUS_SOCKET_PATH=/var/lib/incus/unix.socket` (preferred local daemon path)

Manual worker run:

```bash
sudo /opt/uppoint-cloud/scripts/run-incus-worker.sh
tail -n 100 /var/log/uppoint-cloud/incus-provisioning-worker.log
```

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
- Weekly cron uses `run-restore-drill-with-report.sh` to execute drill and enqueue a status email via `NotificationOutbox`.
- execute mode is fail-closed unless `UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE=true` is set in `/opt/uppoint-cloud/.env`.
- drill target names are safety-checked:
  - must use `restore_drill_` prefix,
  - must not match primary database name,
  - must not use reserved names (`postgres`, `template0`, `template1`),
  - script refuses pre-existing target DB names.
- restore-drill report email configuration:
  - `UPPOINT_RESTORE_DRILL_EMAIL_ENABLED=true` (default)
  - `UPPOINT_RESTORE_DRILL_EMAIL_TO=...` (optional; defaults to `UPPOINT_ALERT_EMAIL_TO`)

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
- If `INTERNAL_AUDIT_ENDPOINT_URL` is configured, keep it on loopback only (`127.0.0.1`, `::1`, or `localhost`).
- Keep `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` unset and use `RATE_LIMIT_REDIS_URL` for production auth rate limiting.
- `replicate-audit-anchor.sh` exits with skip unless both are explicitly set:
  - `UPPOINT_CLOSED_SYSTEM_MODE=false`
  - `UPPOINT_ENABLE_AUDIT_ANCHOR_REPLICATION=true`
- Enable off-host replication only with explicit owner approval and documented exception.

Security SLO report:
- `run-security-slo-report.sh` evaluates security thresholds using `AuditLog` and `NotificationOutbox` over a lookback window.
- Configure optional thresholds in `.env`:
  - `SECURITY_SLO_LOOKBACK_MINUTES` (default `60`)
  - `SECURITY_SLO_MAX_LOGIN_OTP_FAILED` (default `120`)
  - `SECURITY_SLO_MAX_PASSWORD_RESET_FAILED` (default `60`)
  - `SECURITY_SLO_MAX_RATE_LIMIT_EXCEEDED` (default `300`)
  - `SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE` (default `5`; absolute terminal FAILED count threshold)
  - `SECURITY_SLO_MAX_LOW_SAMPLE_NOTIFICATION_FAILED_ABSOLUTE` (default `0`; hard-fail threshold for failed terminal notifications during low-sample windows)
  - `SECURITY_SLO_MAX_NOTIFICATION_DELIVERY_FAILURE_RATIO` (default `0.25`)
  - `SECURITY_SLO_MIN_NOTIFICATION_TERMINAL` (default `20`; minimum terminal delivery sample before ratio alerting)
  - `SECURITY_SLO_WARN_ON_LOW_NOTIFICATION_SAMPLE` (default `true`; advisory when terminal sample is below ratio activation window)
  - `SECURITY_SLO_MAX_AUTH_NOTIFICATION_P95_SECONDS` (default `20`; auth OTP notification delivery p95 threshold)
  - `SECURITY_SLO_MAX_AUTH_NOTIFICATION_FAILED_ABSOLUTE` (default `0`; hard-fail threshold for auth-scope terminal delivery failures)
  - `SECURITY_SLO_MIN_AUTH_NOTIFICATION_SAMPLE` (default `10`; minimum auth notification sample before p95 is enforced)
  - `SECURITY_SLO_WARN_ON_LOW_AUTH_NOTIFICATION_SAMPLE` (default `true`; advisory when auth sample is low)
  - `NOTIFICATION_OUTBOX_IMMEDIATE_DISPATCH_BATCH_SIZE` (default `10`; inline auth dispatch batch size)
  - `NOTIFICATION_OUTBOX_IMMEDIATE_DISPATCH_THROTTLE_MS` (default `5000`; inline auth dispatch cooldown in ms)
- Exit code `1` indicates threshold breach and should be treated as an alert signal.
- Low-sample windows stay advisory-only only when there are no terminal failures. Any terminal failures during a low-sample window now trigger the absolute-failure guard and return exit code `1`.

Notification canary:
- `run-notification-canary.sh` runs every 30 minutes via cron with `scope=ops-notification-canary`.
- Default mode is `probe-only` (no outbound email send): it performs DB connectivity and notification queue health checks.
- Optional legacy mode `enqueue-email` can enqueue a low-risk canary email when explicitly enabled.
- Optional canary env keys:
  - `UPPOINT_NOTIFICATION_CANARY_ENABLED` (default `true`)
  - `UPPOINT_NOTIFICATION_CANARY_MODE` (default `probe-only`; allowed: `probe-only`, `enqueue-email`)
  - `UPPOINT_NOTIFICATION_CANARY_EMAIL_TO` (optional; only used by `enqueue-email`, falls back to `UPPOINT_ALERT_EMAIL_TO`)

Weekly security gate cron:
- `uppoint-security-gate-weekly` runs `scripts/verify-security-gate.sh` every Sunday at `05:30`.
- Purpose: periodic full-stack verification even when no deployment happened that week.
- CI/ops default: cron template enforces remote read-only smoke (`SECURITY_GATE_REQUIRE_REMOTE_SMOKE=1`, `E2E_ALLOW_MUTATIONS=0`, `E2E_BASE_URL=https://cloud.uppoint.com.tr`).
- Output log: `/var/log/uppoint-security-gate-weekly.log`.

Remote auth smoke operational checklist (GitHub Actions):
- Trigger a manual run when needed:
  - `cd /opt && gh workflow run remote-auth-smoke.yml --ref main`
- Verify latest run outcome:
  - `cd /opt && gh run list --workflow \"Remote Auth Smoke\" --limit 1`
  - expected: `conclusion=success` on `main`
- Verify token-gated production health guard passed:
  - `cd /opt && gh run view <run-id> --json jobs`
  - step `Require healthcheck token for production target` must be `success`
- Verify CI summary on the run page:
  - open run URL and confirm summary contains `E2E_HEALTHCHECK_TOKEN: configured`
  - if summary shows `missing`, treat as release-blocking and fix Actions secret first.

Release gate operational checklist (GitHub Actions):
- Workflow file:
  - `.github/workflows/security-release-gate.yml`
- Trigger:
  - automatic on `pull_request` and `push` to `main`
- Required result:
  - `Verify security gate` must pass
  - on `push main`, `Remote auth smoke (release gate)` must pass in read-only mode
- Branch protection recommendation:
  - require both checks before merge/deploy approval

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
- `/var/log/uppoint-notification-canary.log`
- `/var/log/uppoint-nginx-drift-check.log`
- `/var/log/uppoint-audit-integrity-check.log`
- `/var/log/uppoint-security-slo-report.log`
- `/var/log/uppoint-security-gate-weekly.log`
- `/var/log/uppoint-cloud/security-alerts.log`
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

## 16. Internal token rotation runbook (`INTERNAL_AUDIT_TOKEN`, `INTERNAL_DISPATCH_TOKEN`, `INTERNAL_PROVISIONING_TOKEN`)

These tokens secure internal-only endpoints:

- `INTERNAL_AUDIT_TOKEN` -> `POST /api/internal/audit/security-event`
- `INTERNAL_DISPATCH_TOKEN` -> `POST /api/internal/notifications/dispatch`
- `INTERNAL_PROVISIONING_TOKEN` -> `POST /api/internal/instances/provisioning/claim|report`

Current implementation is single-active-token (no dual-token grace window), so rotation is a direct cutover.

### 16.1 Prepare new tokens

```bash
NEW_INTERNAL_AUDIT_TOKEN="$(openssl rand -hex 32)"
NEW_INTERNAL_DISPATCH_TOKEN="$(openssl rand -hex 32)"
NEW_INTERNAL_PROVISIONING_TOKEN="$(openssl rand -hex 32)"
```

### 16.2 Back up and update `.env`

```bash
sudo cp /opt/uppoint-cloud/.env "/opt/uppoint-cloud/.env.bak.$(date +%Y%m%d%H%M%S)"
sudo sed -i "s#^INTERNAL_AUDIT_TOKEN=.*#INTERNAL_AUDIT_TOKEN=${NEW_INTERNAL_AUDIT_TOKEN}#" /opt/uppoint-cloud/.env
sudo sed -i "s#^INTERNAL_DISPATCH_TOKEN=.*#INTERNAL_DISPATCH_TOKEN=${NEW_INTERNAL_DISPATCH_TOKEN}#" /opt/uppoint-cloud/.env
sudo sed -i "s#^INTERNAL_PROVISIONING_TOKEN=.*#INTERNAL_PROVISIONING_TOKEN=${NEW_INTERNAL_PROVISIONING_TOKEN}#" /opt/uppoint-cloud/.env
```

If keys do not exist yet, append once:

```bash
grep -q '^INTERNAL_AUDIT_TOKEN=' /opt/uppoint-cloud/.env || echo "INTERNAL_AUDIT_TOKEN=${NEW_INTERNAL_AUDIT_TOKEN}" | sudo tee -a /opt/uppoint-cloud/.env
grep -q '^INTERNAL_DISPATCH_TOKEN=' /opt/uppoint-cloud/.env || echo "INTERNAL_DISPATCH_TOKEN=${NEW_INTERNAL_DISPATCH_TOKEN}" | sudo tee -a /opt/uppoint-cloud/.env
grep -q '^INTERNAL_PROVISIONING_TOKEN=' /opt/uppoint-cloud/.env || echo "INTERNAL_PROVISIONING_TOKEN=${NEW_INTERNAL_PROVISIONING_TOKEN}" | sudo tee -a /opt/uppoint-cloud/.env
```

### 16.3 Restart service and verify

```bash
cd /opt/uppoint-cloud
sudo systemctl restart uppoint-cloud.service
sudo systemctl is-active --quiet uppoint-cloud.service
sudo /opt/uppoint-cloud/scripts/dispatch-notifications.sh
sudo /opt/uppoint-cloud/scripts/run-incus-worker.sh
```

Expected:
- service is `active`
- dispatch script returns `OK`

### 16.4 Post-rotation checks

```bash
journalctl -u uppoint-cloud.service -n 200 --no-pager | rg -n "INTERNAL_AUDIT_TOKEN|INTERNAL_DISPATCH_TOKEN|INTERNAL_PROVISIONING_TOKEN|UNAUTHORIZED|INVALID_BODY" || true
tail -n 100 /var/log/uppoint-cloud/dispatch-notifications.log
tail -n 100 /var/log/uppoint-cloud/incus-provisioning-worker.log
```

### 16.5 Rollback

If internal calls fail after rotation:

```bash
sudo cp /opt/uppoint-cloud/.env.bak.<timestamp> /opt/uppoint-cloud/.env
sudo systemctl restart uppoint-cloud.service
sudo /opt/uppoint-cloud/scripts/dispatch-notifications.sh
```
