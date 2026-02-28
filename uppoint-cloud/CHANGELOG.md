# Changelog

## 2026-02-28 (Build now auto-restarts Next.js service)

### Changed
- Updated `npm run build` to run `next build` and then automatically restart `uppoint-cloud.service` when systemd service is available.
- Added `service:restart` npm script with safe detection and explicit restart status output.
- Added `NEXT_SKIP_SERVICE_RESTART=1` bypass support for maintenance/deploy flows that intentionally keep the service stopped.
- Updated deployment docs to reflect auto-restart behavior and the bypass command.
- Increased login and register auth-card title size to `24px` (`text-2xl`) via reusable `AuthCard` title class support.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Password reset flow connected end-to-end)

### Added
- Added `Şifremi unuttum?` / `Forgot password?` link to login flow (visible in both login steps).
- Added localized forgot-password request pages:
  - `/{locale}/forgot-password`
  - `/forgot-password` (default locale redirect)
- Added localized reset-password pages:
  - `/{locale}/reset-password`
  - `/reset-password` (default locale redirect)
- Added password reset API endpoints:
  - `POST /api/auth/forgot-password/request`
  - `POST /api/auth/forgot-password/reset`
- Added password-reset server service with secure token hashing and TTL-based expiry.
- Added Prisma `PasswordResetToken` model and migration for token persistence.

### Changed
- Included `/forgot-password` and `/reset-password` in auth-route redirect rules so authenticated users are sent to dashboard.
- Updated route-access tests for new auth route coverage.
- Updated README with password-reset routes, architecture, and env requirements.

### Verification
- `npm run prisma:generate` -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (TR login email label text update)

### Changed
- Updated Turkish login first-step identifier label from "E-posta veya telefon numarası" to "E-Posta".

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages background effects removed)

### Changed
- Removed decorative blob background effect layers from localized login and register pages.
- Simplified auth page `<main>` wrappers by dropping effect-related positioning classes (`relative`, `isolate`, `overflow-hidden`).

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth account/email summary UI refinement)

### Changed
- Improved the step-2 account/email summary presentation in auth forms for better readability and hierarchy.
- Updated login and register summary blocks to a consistent card style using theme tokens (border + muted background + stronger value emphasis).

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Register phone label visibility update)

### Changed
- `register` formundaki telefon alanı başlığı görselden kaldırıldı (`Label` artık `sr-only`)
- Erişilebilirlik için telefon alanı etiketi screen-reader seviyesinde korunmaya devam ediyor

### Verification
- `npm run lint` → ✓
- `npm run typecheck` → ✓
- `npm run test` → ✓
- `npm run build` → ✓

---

## 2026-02-28 (Register phone input height alignment)

### Fixed
- `register` sayfasındaki `PhoneInput` yüksekliği `h-9` idi; `Ad Soyad` ve `Şifre` alanları (`FloatingInput`) ile uyumlu olacak şekilde `h-12` olarak güncellendi
- Bileşik telefon alanında iç `select` ve `input` elemanları `h-full` yapılarak dikey hizalama tutarlı hale getirildi

### Verification
- `npm run lint` → ✓
- `npm run typecheck` → ✓
- `npm run test` → ✓
- `npm run build` → ✓

---

## 2026-02-28 (Auth forms: floating label inputs)

### Added
- `FloatingInput` component (`components/ui/floating-input.tsx`): floating label pattern — label sits inside the input at center, floats to the top border on focus or when a value is present; uses `useState` for focus tracking + `peer-placeholder-shown` for value detection; styled to match shadcn `Input` tokens

### Changed
- `login-form.tsx`: email and password fields now use `FloatingInput` (removed `Label + Input` pairs)
- `register-form.tsx`: email, name, and password fields now use `FloatingInput`; phone field keeps `Label + PhoneInput` (composite component)

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---


## 2026-02-28 (Register form: info icon on password hint)

### Changed
- Password hint now prefixed with Lucide `Info` icon (`h-3 w-3 mt-0.5 shrink-0`) for visual clarity

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Register form: password requirements hint)

### Added
- Static `passwordHint` text shown below the password strength bar on the register form
- `validation.passwordHint` key in TR and EN dictionaries
- TR: "Şifre en az 12 karakter ve büyük harf, küçük harf, rakam ile sembol içermelidir."
- EN: "Password must be at least 12 characters and include an uppercase letter, lowercase letter, number, and symbol."

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Auth pages: fix blob visibility — add isolate to main)

### Fixed
- Blobs were not visible: `<main>` lacked a stacking context, so `-z-10` blobs fell behind the page's opaque white background
- Added `isolate` class (`isolation: isolate`) to `<main>` on both login and register pages so blobs render correctly above the page background and below the card

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Auth pages: gradient blob background + glassmorphism card)

### Changed
- Login and register pages: added 3 decorative gradient blobs (indigo/violet/sky, `blur-[120px]`, `pointer-events-none aria-hidden -z-10`)
- `AuthCard`: `bg-card/80 backdrop-blur-md shadow-2xl` for frosted glass effect
- Login/register `<main>`: `min-h-[calc(100vh-3.5rem)]` → `min-h-[calc(100vh-4rem)]` (aligned with h-16 header)
- Login blob arrangement: indigo top-left, violet bottom-right, sky center
- Register blob arrangement: violet top-left, indigo bottom-right, sky upper-right

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 16/16 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

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
