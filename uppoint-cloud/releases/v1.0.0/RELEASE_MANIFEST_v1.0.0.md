# Uppoint Cloud Release Manifest

- Release version: `v1.0.0`
- Release model: `Tag + Release Bundle`
- Database bootstrap mode: `Schema-only` (no production data snapshot)
- Repository: `git@github.com:uppointcomtr/uppoint-cloud.git`
- Canonical app root: `/opt/uppoint-cloud`

## Runtime prerequisites

- Linux host with `systemd`
- Node.js and npm compatible with repository lockfile
- PostgreSQL reachable with `DATABASE_URL`
- Redis reachable for rate limiting (`RATE_LIMIT_REDIS_URL`) in production baseline
- Nginx reverse proxy deployment from `ops/nginx/*`

## Required environment keys (minimum production boot set)

- `NODE_ENV`
- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_OTP_PEPPER`
- `INTERNAL_AUDIT_TOKEN`
- `INTERNAL_DISPATCH_TOKEN`
- `INTERNAL_AUDIT_SIGNING_SECRET`
- `INTERNAL_DISPATCH_SIGNING_SECRET`
- `NOTIFICATION_PAYLOAD_SECRET`
- `HEALTHCHECK_TOKEN`

Full environment catalog is documented in:
- `README.md` -> `Environment variables`
- `ops/README.md` -> closed-system baseline example

## Rebuild and deploy from tag

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

## Bundle integrity

- Checksums file: `releases/v1.0.0/checksums.txt`
- Verification command:

```bash
cd /opt/uppoint-cloud/uppoint-cloud
sha256sum -c releases/v1.0.0/checksums.txt
```

## Notes

- This release bundle intentionally excludes production database dumps.
- GitHub release auto-includes source archives for the tag (`zip` and `tar.gz`).
