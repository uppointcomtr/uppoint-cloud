# Changelog

## 2026-02-28 (AppHeader: logo 180px wide, fix layout jump)

### Changed
- Logo width: `h-8 w-auto` → `w-[180px] h-auto` (explicit width reserves layout space, eliminates CLS on click)
- Header inner div: `h-14` → `h-16` to accommodate taller logo (~55px at 180px width)
- Logo Link: added `shrink-0` to prevent flex compression causing layout shift

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (PhoneInput: digits only + no leading zero)

### Changed
- `PhoneInput`: local number field now accepts digits only (`newNumber.replace(/\D/g, "")`) and strips leading zeros — prevents letters, spaces, dashes, etc.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (PhoneInput: strip leading zeros from local number)

### Changed
- `PhoneInput`: local number field now strips leading zeros on input (`newNumber.replace(/^0+/, "")`) — prevents entering `0` after country code

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Required Phone Field with Country Code Selector)

### Changed
- Phone field in registration form is now **required** (previously optional)
- Zod `createPhoneSchema`: removed empty-string bypass (`value === ""`), added `min(1, phoneRequired)`, removed `.default("")` from `getRegisterSchema`
- Phone field label: "Telefon (opsiyonel)" → "Telefon" (TR), "Phone (optional)" → "Phone" (EN)
- `register-form.tsx`: raw `<Input>` replaced with `<Controller>` + `<PhoneInput>`
- `tests/auth/register-user.test.ts`: `EMAIL_TAKEN` fixture now includes required `phone` field

### Added
- `PhoneInput` component (`modules/auth/components/phone-input.tsx`): country code `<select>` (20 countries, TR +90 default) + local number `<input>`, combined output in E.164 format via `Controller`
- `validation.phoneRequired` message key in TR and EN dictionaries

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Localized Email Validation Messages)

### Fixed
- Replaced default Zod English email validation output with locale-aware messages for Turkish and English.
- Ensured login/register email validation uses the current locale dictionary instead of global non-localized schema text.

### Added
- Auth schema tests to verify locale-specific email validation messages for `tr` and `en`.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Two-Step Login UX)

### Changed
- Updated login flow to two-step progression:
  - Step 1: identifier input with `Sonraki` / `Next`
  - Step 2: password input and final sign-in action
- Added localized account summary and back action labels for the password step.
- Kept existing auth/session backend flow unchanged while improving login interaction parity with requested UX.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Login Brand Copy and Logo Alignment)

### Changed
- Added theme-aware Uppoint logo rendering to the login card header without altering existing auth flow structure.
- Revised TR/EN login copy to align with Uppoint Cloud product language.
- Extended shared `AuthCard` to accept optional header content for reusable branded auth headers.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Production Stability Hardening)

### Fixed
- Resolved production rendering break caused by stale build artifacts and Next.js image cache permission errors.
- Ensured root and locale entry flow remains login-first while preserving stable CSS delivery.

### Changed
- Updated logo rendering to `next/image` with `unoptimized` to avoid runtime optimizer cache write dependency for static local logo files.
- Hardened systemd service with `ExecStartPre` directory initialization for `.next/cache/images` under `www-data`.
- Expanded operational runbook with mandatory safe deploy sequence and post-deploy health checks.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- Runtime checks:
  - `curl -I https://cloud.uppoint.com.tr/tr/login` => `200`
  - CSS asset referenced by login page => `200`
  - logo assets `/logo/uppoint-logo-black.webp` and `/logo/Uppoint-logo-wh.webp` => `200`

## 2026-02-28 (Root Entry Redirect to Login)

### Changed
- Removed localized home landing behavior from root entry.
- Updated `/` and `/{locale}` entry routes to redirect directly to `/{locale}/login`.
- Aligned default first contact flow with authentication-first requirement.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Theme-Aware Brand Logo Integration)

### Changed
- Updated shared app header to render theme-specific brand logos.
- Light theme now uses `/logo/uppoint-logo-black.webp`.
- Dark theme now uses `/logo/Uppoint-logo-wh.webp`.

### Documentation
- Added logo asset naming/placement requirements under `README.md`.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 2026-02-28 (Theme Compliance and UX Controls)

### Added
- Theme provider with persisted user preference (`light`/`dark`) and default light behavior.
- Theme initialization script to prevent inconsistent first paint between saved theme and rendered UI.
- Shared locale header with theme toggle and locale switch controls.
- Manual dark/light visual smoke checklist for TR/EN auth flows in `README.md`.

### Changed
- Updated localized layouts to include shared header controls.
- Refined auth/dashboard page shells to account for header space in viewport layout.
- Removed hardcoded destructive button text color in favor of theme token usage.
- Extended design tokens with `destructive-foreground` for consistent contrast across themes.

### Verification
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

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
