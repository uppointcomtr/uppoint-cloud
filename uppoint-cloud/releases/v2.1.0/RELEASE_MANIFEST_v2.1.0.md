# Uppoint Cloud Release Manifest

- Release version: `v2.1.0`
- Release model: `Tag + Release Bundle`
- Repository: `git@github.com:uppointcomtr/uppoint-cloud.git`
- Canonical app root: `/opt/uppoint-cloud`
- Provisioning model: `Incus-first` (internal signed worker protocol)

## Scope

- Internal provisioning control-plane endpoints:
  - `POST /api/internal/instances/provisioning/claim`
  - `POST /api/internal/instances/provisioning/report`
- Provisioning job lifecycle expansion with lock/retry/backoff metadata.
- OVS/VLAN day-1 preparation boundary (worker-side idempotent stage).
- Same-repo worker runtime (`workers/incus`) and cron/systemd operational assets.

## Runtime prerequisites

- Linux host with `systemd`
- Node.js and npm compatible with repository lockfile
- PostgreSQL reachable with `DATABASE_URL`
- Redis reachable for rate limiting (`RATE_LIMIT_REDIS_URL`) in production baseline
- Local Incus daemon with host KVM support (`/dev/kvm`) for VM provisioning (single-host control-plane mode)

## Required environment keys (minimum production boot set)

- `NODE_ENV`
- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_OTP_PEPPER`
- `INTERNAL_AUDIT_TOKEN`
- `INTERNAL_DISPATCH_TOKEN`
- `INTERNAL_PROVISIONING_TOKEN`
- `INTERNAL_AUDIT_SIGNING_SECRET`
- `INTERNAL_DISPATCH_SIGNING_SECRET`
- `INTERNAL_PROVISIONING_SIGNING_SECRET`
- `NOTIFICATION_PAYLOAD_SECRET`
- `HEALTHCHECK_TOKEN`
- `INCUS_SOCKET_PATH` or `INCUS_ENDPOINT`

Full environment catalog is documented in:
- `README.md` -> `Environment variables`
- `ops/README.md` -> closed-system baseline example

## Rebuild and deploy from tag

```bash
cd /opt
git clone git@github.com:uppointcomtr/uppoint-cloud.git
cd uppoint-cloud/uppoint-cloud
git checkout v2.1.0
cp /opt/uppoint-cloud/.env .env
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm run build:deploy
```

## Bundle integrity

- Checksums file: `releases/v2.1.0/checksums.txt`
- Verification command:

```bash
cd /opt/uppoint-cloud/uppoint-cloud
sha256sum -c releases/v2.1.0/checksums.txt
```

## Notes

- This release bundle intentionally excludes production database dumps.
- GitHub release auto-includes source archives for the tag (`zip` and `tar.gz`).
