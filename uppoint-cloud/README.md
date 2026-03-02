# Uppoint Cloud

Production-oriented foundation for `cloud.uppoint.com.tr`.

## Implemented milestone

- Authentication MVP
  - Registration (`/:locale/register`)
    - email verification code (3 min countdown)
    - SMS verification code (3 min countdown)
    - email + phone verification is completed in-sequence before sign-in readiness
  - Login (`/:locale/login`)
  - Login supports two flows on a segmented tab:
    - Email login: email -> password -> email OTP (3-minute countdown) -> sign in
    - Phone login: phone -> password -> SMS OTP (3-minute countdown) -> sign in
  - Email verification is required before successful sign-in
  - Modal-based forgot-password flow inside login:
    - email verification code (3 min countdown)
    - SMS verification code (3 min countdown)
    - new password + confirm password step
  - Logout (dashboard action)
  - Protected dashboard placeholder (`/:locale/dashboard`)
  - Route protection via proxy + server-side checks
  - JWT session revocation via `User.tokenVersion` checks
  - Atomic one-time token/code consumption for login/register/password-reset challenge flows
  - Database-backed auth persistence (Auth.js + Prisma adapter)
  - Notification outbox + async dispatcher for SMTP email + Verimor SMS (auth endpoints no longer block on provider latency)
  - Token-based password reset completion after dual verification
  - Identifier + IP based auth rate-limiting (email/phone/user + IP)
- Root entry (`/` and `/:locale`) redirects directly to localized login page
- Legacy `/forgot-password` and `/reset-password` pages now redirect to localized login; recovery is popup-only
- Localization foundation
  - Primary/default locale: Turkish (`tr`)
  - Secondary locale: English (`en`)
  - Dedicated localization modules under `modules/i18n` and `messages`
  - Locale-aware routing and redirects (`/tr` default)
- Theme foundation
  - Light theme as default
  - Dark theme with persisted user preference (`localStorage`)
  - Shared header UI includes locale switcher and theme toggle
- Initial production serving setup
  - systemd service definition
  - Nginx reverse proxy configs (bootstrap HTTP + TLS)
  - Let's Encrypt issuance and renewal command plan

## Stack

- Next.js App Router + TypeScript strict mode
- shadcn/ui
- Prisma + Managed PostgreSQL
- Zod
- React Hook Form
- Auth.js (`next-auth`) with Prisma adapter

## Environment variables

Create and maintain `.env` with real values (do not commit it):

- `NODE_ENV`
- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_OTP_PEPPER` (required in production; must be distinct from `AUTH_SECRET`)
- `INTERNAL_AUDIT_TOKEN` (required in production; secures internal edge-audit ingest route)
- `INTERNAL_DISPATCH_TOKEN` (required in production; secures internal notification dispatcher route)
- `INTERNAL_AUDIT_SIGNING_SECRET` (required in production; HMAC signing key for internal audit ingest requests)
- `INTERNAL_DISPATCH_SIGNING_SECRET` (required in production; HMAC signing key for notification dispatch requests)
- `AUTH_TRUST_HOST`
- `AUTH_BCRYPT_ROUNDS`
- `AUTH_SESSION_REVALIDATE_SECONDS` (optional, default `300`)
- `AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES`
- `AUDIT_LOG_RETENTION_DAYS` (optional, default `180`, min `30`)
- `HEALTHCHECK_TOKEN` (required in production; callers must send `x-health-token`)
- `UPPOINT_ALLOWED_HOSTS` (optional, comma-separated host allowlist for production request host validation)
- `UPPOINT_ALLOWED_ORIGINS` (optional, comma-separated origin allowlist for production API mutation origin validation)
- `RATE_LIMIT_REDIS_URL` (optional, preferred local Redis backend for auth rate limiting)
- `UPSTASH_REDIS_REST_URL` (optional, enables Redis-backed IP rate limiting)
- `UPSTASH_REDIS_REST_TOKEN` (optional, required with `UPSTASH_REDIS_REST_URL`)
- `UPPOINT_DEFAULT_FROM_EMAIL`
- `UPPOINT_EMAIL_BACKEND`
- `UPPOINT_EMAIL_HOST`
- `UPPOINT_EMAIL_PORT`
- `UPPOINT_EMAIL_HOST_USER`
- `UPPOINT_EMAIL_HOST_PASSWORD`
- `UPPOINT_EMAIL_USE_TLS`
- `UPPOINT_SMS_ENABLED`
- `UPPOINT_SMS_API_URL`
- `UPPOINT_SMS_USERNAME`
- `UPPOINT_SMS_PASSWORD`
- `UPPOINT_SMS_SOURCE_ADDR`
- `UPPOINT_SMS_VALID_FOR`
- `UPPOINT_SMS_DATACODING`
- `UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS` (optional, default `false`; legacy provider compatibility)
- `AUDIT_FALLBACK_LOG_PATH` (optional, JSONL fallback path for audit write failures)
- `NOTIFICATION_PAYLOAD_SECRET` (required in production; encrypts notification outbox payload at rest)
- `NOTIFICATION_OUTBOX_RETENTION_DAYS` (optional, cleanup retention for sent/failed outbox rows, default `30`)
- `AUDIT_LOG_ARCHIVE_BEFORE_DELETE` (optional, default `true`; archive old audit rows before retention delete)
- `AUDIT_LOG_ARCHIVE_DIR` (optional, default `/opt/backups/audit`; archive path used by `cleanup-db.sh`)
- `UPPOINT_ALERT_SLACK_WEBHOOK` (optional, ops alert channel for nginx drift failures)
- `UPPOINT_ALERT_EMAIL_TO` (optional, ops alert recipient; enqueued via `NotificationOutbox`)
- `UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES` (optional, default `60`)

## Upstash rate limit activation

Rate-limit backend priority:
1. `RATE_LIMIT_REDIS_URL` (local Redis)
2. Upstash (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
3. Prisma fallback

When `RATE_LIMIT_REDIS_URL` is set, auth rate limiting uses local Redis sliding window.
If local Redis is not configured/reachable, system tries Upstash; if that is unavailable too, it falls back to Prisma-backed limiting with fail-closed behavior for auth routes.
Note: Redis `maxmemory` is a Redis-specific data-store cap and does not conflict with `uppoint-cloud.service` / `tune-system.sh` memory tuning for Node.js and kernel layers.

Operational check:

```bash
cd /opt/uppoint-cloud
awk -F= '/^(RATE_LIMIT_REDIS_URL|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)=/{print $1"=<set>"}' .env
```

## Brand assets

Store logo assets in `public/logo/` with these exact names for theme-aware header rendering:

- `public/logo/uppoint-logo-black.webp` (used in light theme)
- `public/logo/Uppoint-logo-wh.webp` (used in dark theme)

## Auth and i18n architecture (high level)

- Auth runtime config: [auth.ts](/opt/uppoint-cloud/auth.ts)
- Credentials validation: [modules/auth/schemas/auth-schemas.ts](/opt/uppoint-cloud/modules/auth/schemas/auth-schemas.ts)
- Registration verification challenge service: [modules/auth/server/register-verification-challenge.ts](/opt/uppoint-cloud/modules/auth/server/register-verification-challenge.ts)
- Login OTP challenge service: [modules/auth/server/login-challenge.ts](/opt/uppoint-cloud/modules/auth/server/login-challenge.ts)
- Password hashing: [modules/auth/server/password.ts](/opt/uppoint-cloud/modules/auth/server/password.ts)
- Password recovery challenge service: [modules/auth/server/password-reset-challenge.ts](/opt/uppoint-cloud/modules/auth/server/password-reset-challenge.ts)
- Notification outbox service: [modules/notifications/server/outbox.ts](/opt/uppoint-cloud/modules/notifications/server/outbox.ts)
- User soft-delete lifecycle service: [modules/auth/server/user-lifecycle.ts](/opt/uppoint-cloud/modules/auth/server/user-lifecycle.ts)
- Email notification service: [modules/auth/server/email-service.ts](/opt/uppoint-cloud/modules/auth/server/email-service.ts)
- SMS notification service: [modules/auth/server/sms-service.ts](/opt/uppoint-cloud/modules/auth/server/sms-service.ts)
- Tenant context resolver: [modules/tenant/server/user-tenant.ts](/opt/uppoint-cloud/modules/tenant/server/user-tenant.ts)
- Idempotent API helper: [lib/http/idempotency.ts](/opt/uppoint-cloud/lib/http/idempotency.ts)
- Route protection and locale redirects: [proxy.ts](/opt/uppoint-cloud/proxy.ts)
- Logout audit endpoint: [app/api/auth/logout/route.ts](/opt/uppoint-cloud/app/api/auth/logout/route.ts)
- Locale configuration: [modules/i18n/config.ts](/opt/uppoint-cloud/modules/i18n/config.ts)
- Locale path helpers: [modules/i18n/paths.ts](/opt/uppoint-cloud/modules/i18n/paths.ts)
- Dictionaries: [messages/tr.ts](/opt/uppoint-cloud/messages/tr.ts), [messages/en.ts](/opt/uppoint-cloud/messages/en.ts)
- Theme provider: [modules/theme/theme-provider.tsx](/opt/uppoint-cloud/modules/theme/theme-provider.tsx)
- Theme config/script: [modules/theme/config.ts](/opt/uppoint-cloud/modules/theme/config.ts), [modules/theme/theme-script.ts](/opt/uppoint-cloud/modules/theme/theme-script.ts)
- Shared auth shell controls: [components/shared/theme-toggle.tsx](/opt/uppoint-cloud/components/shared/theme-toggle.tsx), [components/shared/locale-switcher.tsx](/opt/uppoint-cloud/components/shared/locale-switcher.tsx), [modules/auth/components/auth-split-shell.tsx](/opt/uppoint-cloud/modules/auth/components/auth-split-shell.tsx)

## Local development

```bash
npm ci
npm run prisma:generate
npm run dev
```

## Verification

```bash
npm run prisma:migrate:deploy
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run verify:nginx-drift
```

Nginx rate-limit drift policy:

- `RATE_LIMIT_DRIFT_POLICY=warn` (default): tuned `/etc/nginx/conf.d/uppoint-rate-limit.conf` differences remain warning-level.
- `RATE_LIMIT_DRIFT_POLICY=enforce-baseline`: tuned file must match approved baseline hash (`/etc/uppoint-cloud/uppoint-rate-limit.conf.sha256` by default).
- `RATE_LIMIT_DRIFT_POLICY=strict-template`: tuned file must match repo template exactly.

Approve current tuned file as baseline:

```bash
sudo install -d -m 755 /etc/uppoint-cloud
sudo sha256sum /etc/nginx/conf.d/uppoint-rate-limit.conf | sudo tee /etc/uppoint-cloud/uppoint-rate-limit.conf.sha256 >/dev/null
```

Enforced drift check run:

```bash
cd /opt/uppoint-cloud
RATE_LIMIT_DRIFT_POLICY=enforce-baseline npm run verify:nginx-drift
```

Periodic server-side drift enforcement:

```bash
sudo cp /opt/uppoint-cloud/ops/cron/uppoint-nginx-drift-check /etc/cron.d/uppoint-nginx-drift-check
sudo chmod 644 /etc/cron.d/uppoint-nginx-drift-check
```

Optional alert channels for drift failures:

```bash
# Slack webhook (Incoming Webhook URL)
UPPOINT_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...

# Email recipient (queued to NotificationOutbox)
UPPOINT_ALERT_EMAIL_TO=ops@uppoint.com.tr
UPPOINT_NGINX_DRIFT_ALERT_COOLDOWN_MINUTES=60
```

One-shot full gate:

```bash
npm run verify
```

Note: `npm run build` performs only `next build`.
Use `npm run build:deploy` for build + service restart.

## E2E smoke tests

Auth E2E smoke suite lives under `tests/e2e/` and validates live HTTP behavior for:
- login/register page reachability
- deprecated endpoint contract baseline
- health endpoint contract baseline

Run:

```bash
cd /opt/uppoint-cloud
npm run test:e2e
```

By default smoke runs in read-only mode (`E2E_ALLOW_MUTATIONS=0`).
To run mutating auth scenarios in an isolated non-production environment:

```bash
cd /opt/uppoint-cloud
E2E_ALLOW_MUTATIONS=1 npm run test:e2e
```

Remote environment smoke (already-deployed domain):

```bash
cd /opt/uppoint-cloud
E2E_BASE_URL=https://cloud.uppoint.com.tr npm run test:e2e:remote
```

GitHub Actions nightly/ondemand remote smoke:

- Workflow file: [remote-auth-smoke.yml](/opt/.github/workflows/remote-auth-smoke.yml)
- Schedule: every night at `00:15 UTC` (`03:15 Europe/Istanbul`)
- Manual run: `Actions -> Remote Auth Smoke -> Run workflow`
- Optional manual input:
  - `allow_mutations=1` (only for isolated non-production environments)
- Optional secret:
  - `E2E_HEALTHCHECK_TOKEN` (only needed if remote `/api/health` requires token)
- Optional repository variable:
  - `E2E_BASE_URL` (default is `https://cloud.uppoint.com.tr`)

## Visual smoke checklist (light/dark, TR/EN auth)

Run this checklist after deployment or UI-affecting changes:

1. Open `/tr/login` in a private window and confirm default theme is light.
2. Switch to dark theme using the header toggle and refresh the page.
3. Confirm dark theme persists after refresh on `/tr/login`.
4. Navigate to `/tr/register` and verify form fields, labels, buttons, and alerts remain readable in dark theme.
5. Switch locale to EN from header and confirm `/en/register` loads with dark theme still active.
6. Navigate to `/en/login` and verify layout consistency and contrast in dark theme.
7. Toggle back to light theme in EN and refresh `/en/login`; confirm persistence.
8. Sign in and verify `/tr/dashboard` and `/en/dashboard` render correctly in both themes.
9. Trigger an auth error state (invalid credentials) in TR and EN and verify alert contrast/readability in both themes.
10. Verify focus rings are visible on keyboard navigation for all auth controls in both themes.

## Security hardening notes

- `POST /api/auth/forgot-password/request` and `POST /api/auth/forgot-password/reset` are intentionally deprecated and now explicitly return `410 ENDPOINT_DEPRECATED` as unified JSON.
- `GET/POST /api/auth/verify-email` are intentionally deprecated and now return `410 ENDPOINT_DEPRECATED`; registration verification is OTP-only via `/api/auth/register/challenge/*`.
- Auth OTP verify endpoints include both IP and challenge-id based limiter layers.
- `logAudit()` emits structured `[security-signal]` log lines for high-risk auth/tenant failures (`rate_limit_exceeded`, OTP failures, tenant access denials) to support alert pipelines.
- Production edge guard rejects invalid host/origin requests (`INVALID_HOST_HEADER`, `ORIGIN_NOT_ALLOWED`) and emits edge rejection events into audit storage via internal ingest route.
- CSP is nonce-based at Nginx layer: per-request `$request_id` is used as script/style nonce and injected into HTML tags via `sub_filter`.
- Both `script-src` and `style-src` avoid `unsafe-inline`; nonce is enforced for inline script/style tags.
- Health endpoint exposure is minimized:
  - `/api/health` returns minimal status payload only
  - in production, if `HEALTHCHECK_TOKEN` is set, callers must send `x-health-token`
  - local Nginx probe endpoint `/healthz` is loopback-only and injects token via snippet (`/etc/nginx/snippets/uppoint-health-token.conf`)
- Internal operational endpoints are token-isolated:
  - `/api/internal/audit/security-event` requires:
    - `x-internal-audit-token` matching `INTERNAL_AUDIT_TOKEN`
    - `x-internal-request-id` (single-use request nonce)
    - `x-internal-request-ts` + `x-internal-request-signature` (HMAC-SHA256 canonical request signature)
    - shared signing secret: `INTERNAL_AUDIT_SIGNING_SECRET`
  - `/api/internal/notifications/dispatch` requires:
    - `x-internal-dispatch-token` matching `INTERNAL_DISPATCH_TOKEN`
    - `x-internal-request-id` (single-use request nonce)
    - `x-internal-request-ts` + `x-internal-request-signature` (HMAC-SHA256 canonical request signature)
    - shared signing secret: `INTERNAL_DISPATCH_SIGNING_SECRET`
- Notification outbox payloads are encrypted at rest with `NOTIFICATION_PAYLOAD_SECRET`.
- Backup scripts now enforce restrictive filesystem permissions (`umask 077`, directories `700`, files `600`).
- Backup scripts now create `*.sha256` checksum sidecars, and restore scripts verify checksums by default.

## Production run on `/opt/uppoint-cloud`

```bash
cd /opt/uppoint-cloud
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
sudo systemctl enable --now uppoint-cloud.service
```

Service file:
- [ops/systemd/uppoint-cloud.service](/opt/uppoint-cloud/ops/systemd/uppoint-cloud.service)

## Nginx + Let's Encrypt

Prepared configs:

- Bootstrap HTTP config (before cert issuance):
  - [ops/nginx/cloud.uppoint.com.tr.bootstrap.conf](/opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.bootstrap.conf)
- TLS config (after cert issuance):
  - [ops/nginx/cloud.uppoint.com.tr.conf](/opt/uppoint-cloud/ops/nginx/cloud.uppoint.com.tr.conf)

Detailed issuance + renewal steps:

- [ops/README.md](/opt/uppoint-cloud/ops/README.md)

## Deployment blockers for real certificate issuance

Let's Encrypt issuance cannot complete unless all external requirements are ready:

- `cloud.uppoint.com.tr` DNS points to this server
- Ports `80` and `443` are reachable from the internet
- Nginx serves `/.well-known/acme-challenge/` from `/var/www/certbot`
