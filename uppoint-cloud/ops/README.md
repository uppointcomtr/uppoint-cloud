# Production Serving Guide (`cloud.uppoint.com.tr`)

## 1. Application runtime under `/opt/uppoint-cloud`

```bash
cd /opt/uppoint-cloud
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
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

## 2. Nginx reverse proxy setup

Bootstrap HTTP config (used before certificate issuance):

```bash
sudo mkdir -p /var/www/certbot
sudo cp /opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.bootstrap.conf /etc/nginx/sites-available/cloud.uppoint.com.tr.conf
sudo ln -sfn /etc/nginx/sites-available/cloud.uppoint.com.tr.conf /etc/nginx/sites-enabled/cloud.uppoint.com.tr.conf
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
