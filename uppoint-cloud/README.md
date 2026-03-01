# Uppoint Cloud

Production-oriented foundation for `cloud.uppoint.com.tr`.

## Implemented milestone

- Authentication MVP
  - Registration (`/:locale/register`)
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
  - Database-backed session persistence (Auth.js + Prisma adapter)
  - Registration notification hooks for SMTP email + Verimor SMS
  - Token-based password reset completion after dual verification
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
- `AUTH_TRUST_HOST`
- `AUTH_BCRYPT_ROUNDS`
- `AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES`
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

## Brand assets

Store logo assets in `public/logo/` with these exact names for theme-aware header rendering:

- `public/logo/uppoint-logo-black.webp` (used in light theme)
- `public/logo/Uppoint-logo-wh.webp` (used in dark theme)

## Auth and i18n architecture (high level)

- Auth runtime config: [auth.ts](/opt/uppoint-cloud/auth.ts)
- Credentials validation: [modules/auth/schemas/auth-schemas.ts](/opt/uppoint-cloud/modules/auth/schemas/auth-schemas.ts)
- Registration service: [modules/auth/server/register-user.ts](/opt/uppoint-cloud/modules/auth/server/register-user.ts)
- Login credential verification: [modules/auth/server/authenticate-user.ts](/opt/uppoint-cloud/modules/auth/server/authenticate-user.ts)
- Login OTP challenge service: [modules/auth/server/login-challenge.ts](/opt/uppoint-cloud/modules/auth/server/login-challenge.ts)
- Password hashing: [modules/auth/server/password.ts](/opt/uppoint-cloud/modules/auth/server/password.ts)
- Password reset service: [modules/auth/server/password-reset.ts](/opt/uppoint-cloud/modules/auth/server/password-reset.ts)
- Password recovery challenge service: [modules/auth/server/password-reset-challenge.ts](/opt/uppoint-cloud/modules/auth/server/password-reset-challenge.ts)
- Email notification service: [modules/auth/server/email-service.ts](/opt/uppoint-cloud/modules/auth/server/email-service.ts)
- SMS notification service: [modules/auth/server/sms-service.ts](/opt/uppoint-cloud/modules/auth/server/sms-service.ts)
- Route protection and locale redirects: [middleware.ts](/opt/uppoint-cloud/middleware.ts)
- Locale configuration: [modules/i18n/config.ts](/opt/uppoint-cloud/modules/i18n/config.ts)
- Locale path helpers: [modules/i18n/paths.ts](/opt/uppoint-cloud/modules/i18n/paths.ts)
- Dictionaries: [messages/tr.ts](/opt/uppoint-cloud/messages/tr.ts), [messages/en.ts](/opt/uppoint-cloud/messages/en.ts)
- Theme provider: [modules/theme/theme-provider.tsx](/opt/uppoint-cloud/modules/theme/theme-provider.tsx)
- Theme config/script: [modules/theme/config.ts](/opt/uppoint-cloud/modules/theme/config.ts), [modules/theme/theme-script.ts](/opt/uppoint-cloud/modules/theme/theme-script.ts)
- Shared header and controls: [components/shared/app-header.tsx](/opt/uppoint-cloud/components/shared/app-header.tsx), [components/shared/theme-toggle.tsx](/opt/uppoint-cloud/components/shared/theme-toggle.tsx), [components/shared/locale-switcher.tsx](/opt/uppoint-cloud/components/shared/locale-switcher.tsx)

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
npm run build
```

Note: `npm run build` now automatically restarts `uppoint-cloud.service` when systemd and the service are available.
Use `NEXT_SKIP_SERVICE_RESTART=1 npm run build` when you explicitly need to skip auto-restart.

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
