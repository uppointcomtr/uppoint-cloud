# Changelog

## 2026-02-28 (Production Middleware Session Fix)

### Changed
- Updated `proxy.ts` token resolution to use HTTPS-aware secure cookie detection for `next-auth` session token lookup.
- Fixed production route protection behavior where authenticated users were redirected back to login despite valid sessions.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- Live E2E checks on `https://cloud.uppoint.com.tr` for `/tr` and `/en` auth flows.

## 2026-02-28 (Localization Revision)

### Added
- Dedicated localization structure under `modules/i18n` and `messages`.
- Turkish (`tr`) and English (`en`) dictionaries for home, auth forms, dashboard, and validation messages.
- Locale-aware App Router pages under `app/[locale]/`.
- Locale path helper tests in `tests/i18n/paths.test.ts`.

### Changed
- Updated auth UI components to consume locale dictionaries instead of hardcoded copy.
- Updated auth route-access logic and proxy behavior to enforce locale-aware redirects.
- Updated registration API to return stable error codes for locale-safe frontend mapping.
- Updated root and legacy routes to redirect to default locale (`/tr`).
- Updated `README.md` to document `.env` usage and locale-aware routing.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28

### Added
- SMTP email service integration for auth registration notifications.
- Verimor SMS service integration for auth registration notifications.
- Optional phone field support in registration form and auth schema.
- Prisma migration for nullable/unique `User.phone`.

### Changed
- Extended environment validation with `UPPOINT_*` email/SMS configuration, including conditional requirements.
- Updated registration API flow to dispatch email/SMS notifications after successful account creation.
- Updated `.env.example` and `README.md` to document email/SMS runtime requirements.

### Verification
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-27

### Added
- Authentication MVP with registration, login, logout, and protected dashboard placeholder routes.
- Auth module structure under `modules/auth` for schemas, server services, and reusable form components.
- Auth.js (`next-auth`) integration with Prisma adapter and database-backed session persistence.
- Prisma auth schema models (`User`, `Account`, `Session`, `VerificationToken`) for production-minded auth storage.
- Middleware-based route protection and auth-aware redirects.
- Nginx production configs and systemd service definition under `ops/`.
- Let's Encrypt issuance and renewal runbook in `ops/README.md`.
- Vitest test setup with auth-focused unit tests.

### Changed
- Expanded environment validation to include auth-related required variables.
- Updated root page copy to reflect authentication milestone status.
- Updated `.env.example` and `README.md` with auth and production serving requirements.

### Verification
- `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-27 (Foundation Bootstrap)

### Added
- Bootstrapped Next.js App Router project with TypeScript strict mode and Tailwind CSS.
- Initialized shadcn/ui configuration and added base `Button` primitive.
- Added Zod-based server environment validation and startup validation hook.
- Added Prisma foundation for PostgreSQL and reusable Prisma client layer.
- Added `.env.example` and baseline project folder structure (`db`, `lib/env`, `modules/auth`, `tests`, `types`).

### Changed
- Replaced default landing page with a minimal foundation status page.
- Updated `README.md` with bootstrap and verification instructions.
- Enabled explicit `reactStrictMode` in Next.js config.

### Verification
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test` (no script defined yet)
