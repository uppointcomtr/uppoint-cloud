# Production Serving Guide (`cloud.uppoint.com.tr`)

## 1. Application runtime under `/opt/uppoint-cloud`

```bash
cd /opt/uppoint-cloud
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

`npm run build` automatically restarts `uppoint-cloud.service` when available.
If you need to keep the service stopped during a maintenance sequence, run:

```bash
NEXT_SKIP_SERVICE_RESTART=1 npm run build
```

Install the systemd service:

```bash
sudo cp /opt/uppoint-cloud/ops/systemd/uppoint-cloud.service /etc/systemd/system/uppoint-cloud.service
sudo systemctl daemon-reload
sudo systemctl enable --now uppoint-cloud.service
sudo systemctl status uppoint-cloud.service
```

Environment values should be provided in `/etc/uppoint-cloud.env` (not in git), for example:

```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://cloud.uppoint.com.tr
DATABASE_URL=postgresql://...
AUTH_SECRET=replace-with-strong-random-secret
AUTH_TRUST_HOST=true
AUTH_BCRYPT_ROUNDS=12
```

### Safe deployment sequence (required)

Use this sequence for every production deploy to avoid stale build/hash mismatches:

```bash
cd /opt/uppoint-cloud
sudo systemctl stop uppoint-cloud.service
mv .next ".next_backup_$(date +%s)" 2>/dev/null || true
NEXT_SKIP_SERVICE_RESTART=1 npm run build
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

## 8. Redis backup automation

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
