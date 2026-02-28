# Changelog

## 2026-02-28 (Login form: telefon identifier adımı PhoneInput ile değiştirildi)

### Changed
- `login-form.tsx`: telefon sekmesindeki identifier adımında `FloatingInput type="tel"` kaldırıldı; register ekranıyla aynı `PhoneInput` bileşeni kullanılıyor (ülke kodu seçici + yerel numara alanı).

### Risk / Rollback
- Saf UI değişikliği; doğrulama mantığı (getPhoneLoginSchema) etkilenmedi — PhoneInput zaten `+90...` formatında tam numara döndürüyor. Rollback: FloatingInput geri yükle.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth shell: hero image kaldırıldı, sistem rengi glow efektleri eklendi)

### Changed
- `auth-split-shell.tsx`: hero image + siyah overlay kaldırıldı.
- Arka plan `bg-background` (sistem teması) olarak ayarlandı.
- 3 adet `primary` renk tabanlı glow blob eklendi (sol-üst büyük, sağ-alt orta, sağ-orta küçük). Light/dark modda farklı opaklık.

### Risk / Rollback
- Görsel değişiklik; kart ve form mantığı etkilenmedi. Rollback: `next/image fill` hero image geri yükle.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Login form UI: ikon bilgi kartları ve büyük OTP input)

### Changed
- `login-form.tsx`: E-Posta şifre adımında hesap bilgi kartına `Mail` ikonu eklendi.
- `login-form.tsx`: Telefon şifre adımında hesap bilgi kartına `Smartphone` ikonu eklendi.
- `login-form.tsx`: E-Posta OTP adımı `FloatingInput` kaldırıldı; büyük monospace kod girişi (`font-mono text-2xl tracking-[0.4em]`, `border-2`, `py-3.5`) ile değiştirildi.
- `login-form.tsx`: Telefon OTP adımı aynı büyük monospace input ile değiştirildi.

### Risk / Rollback
- Saf görsel değişiklik; form mantığı ve OTP doğrulama akışı etkilenmedi. Rollback: FloatingInput geri yükle, ikon konteyner kaldır.

### Verification
- `npm run lint` -> ✓
- `npx tsc --noEmit` -> ✓
- `npm test` -> 29/29 ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Login upgraded: email/phone tabs with OTP-gated sign-in)

### Changed
- Reworked login UI into a segmented tab flow:
  - `E-Posta`: email -> password -> email OTP
  - `Telefon`: phone -> SMS OTP
- Added 3-minute countdown handling for login OTP steps.
- Enforced sign-in completion through one-time login token consumption (no direct password session creation from the UI flow).
- Added login challenge backend service:
  - `modules/auth/server/login-challenge.ts`
- Added login challenge API routes:
  - `POST /api/auth/login/challenge/email/start`
  - `POST /api/auth/login/challenge/email/verify`
  - `POST /api/auth/login/challenge/phone/start`
  - `POST /api/auth/login/challenge/phone/verify`
- Updated NextAuth credentials provider to consume validated one-time `loginToken`.
- Added Prisma `LoginChallenge` model + migration.
- Added TR/EN localization keys for tabbed OTP login and validation.
- Added test coverage for login challenge service.

### Verification
- `npm run prisma:generate` -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓
- `npm run prisma:migrate:deploy` -> ✓

---

## 2026-02-28 (Auth shell: hero image full-bleed background)

### Changed
- `auth-split-shell.tsx`: düz renk + dot pattern arka plan kaldırıldı; `auth-side-hero.jpg` `next/image fill + object-cover` ile tam sayfa arka plan olarak uygulandı. Üzerine `bg-black/55` overlay eklendi — kart okunabilirliğini korumak için.

### Risk / Rollback
- Görsel değişiklik; kart ve form işlevselliği etkilenmedi. Rollback: solid bg + dot pattern geri yükle.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 25/25 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Forgot-password modal: password strength indicator on new password step)

### Changed
- `forgot-password-modal.tsx`: "Yeni şifre" adımına şifre gücü göstergesi eklendi — `password` state'inden canlı olarak `weak / medium / strong` hesaplanıyor; register formuyla birebir aynı 3-segmentli bar + etiket + hint metni (Info ikonu ile)

### Risk / Rollback
- Yalnızca görsel; iş mantığı değişmedi. Geri almak için strength blok'u kaldırmak yeterli.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 25/25 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Forgot-password modal: professional step-by-step redesign)

### Changed
- `forgot-password-modal.tsx`: tüm adım UI'ı yeniden tasarlandı:
  - **RecoveryStepper**: 4 daireli animasyonlu progress stepper — tamamlananlar yeşil ✓, aktif adım ring efektli, aralarında dolum çizgisi
  - **Email/SMS bilgi kutuları**: sade muted kutu yerine `Mail` / `Phone` ikonu + e-posta/numara + `Clock` ikonu ile kalan süre
  - **Kod girişi**: `FloatingInput` yerine büyük, ortalanmış, monospace, `——————` placeholder'lı `text-2xl tracking-[0.4em]` input
  - **Başarı ekranı**: `Alert` yerine merkezi `CheckCircle` ikonu + başlık + açıklama + buton
  - `max-w-2xl` override kaldırıldı; `AppModal` default `max-w-xl` kullanılıyor
- Tüm iş mantığı (API çağrıları, hata yönetimi, geri sayım) değişmedi

### Risk / Rollback
- Saf UI değişikliği; API/servis katmanı dokunulmadı. Rollback: önceki JSX'e dön.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 25/25 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (PhoneInput: dark mode arka plan ve custom dropdown)

### Changed
- `phone-input.tsx`: native `<select>` yerine custom React dropdown — `bg-popover / border-border / text-popover-foreground` token'ları kullanılıyor; class-based dark modda native select dropdown'u tarayıcı sistemi stilini kullandığından CSS'i takip etmiyordu
- `phone-input.tsx`: outer div'e `dark:bg-input/30` eklendi — `FloatingInput` ile aynı dark background ton uyumu sağlandı
- `phone-input.tsx`: emoji bayraklar (`🇹🇷`) kaldırıldı, `TR +90` formatına geçildi — tarayıcılar emoji'yi metin boyutundan farklı render ettiğinden font tutarsızlığı oluşuyordu

### Risk / Rollback
- Custom dropdown: dışarıya tıklama ile kapanıyor, klavye navigasyonu yok (native select kadar değil). Gerekirse Radix Select kurulabilir.
- Rollback: `CountrySelect` bileşenini kaldırıp native `<select>`'e dön.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 20/20 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Auth shell: tek merkezi kart tasarımı)

### Changed
- `auth-split-shell.tsx`: birden fazla tasarım iterasyonundan (dark split → beyaz → split hero → merkezi kart+hero) sonra nihai tasarım: tek merkezi kart
  - `bg-neutral-100 dark:bg-zinc-950` + radial dot pattern arka plan (slate sınıflarından uzak duruldu — mavi tonu oluşturuyordu)
  - `rounded-2xl border border-border/60 bg-background shadow-2xl dark:border-white/10 dark:shadow-black/60` kart stili — dark modda kartın arka plana karışmaması için
  - Logo (180px genişlik, ışık/karanlık iki varyant), `ThemeToggle iconOnly` + `LocaleSwitcher` üstte
  - Copyright footer en altta
- `theme-toggle.tsx`: `iconOnly` prop eklendi — `size="sm" min-w-10 px-0` ikon-only mod
- `locale-switcher.tsx`: `variant="outline" border-border/70 bg-background/80` stili — ince border eklendi
- `login-form.tsx`, `register-form.tsx`: `headerContent` logo prop kaldırıldı (shell üstlendi)

### Risk / Rollback
- Görsel değişiklik; sayfa işlevselliği aynı. Rollback: `auth-split-shell.tsx` eski versiyona dön.

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 20/20 passed ✓
- `npm run build` → ✓, `uppoint-cloud.service` restarted ✓

---

## 2026-02-28 (Forgot-password popup flow with email+SMS verification)

### Changed
- Replaced standalone forgot/reset pages with a popup-based recovery flow inside login.
- Added shared popup foundation component for consistent modal styling:
  - `components/shared/app-modal.tsx`
- Implemented multi-step password recovery modal:
  - step 1: e-mail code request
  - step 2: e-mail code verification with 3-minute countdown
  - step 3: SMS code verification with 3-minute countdown
  - step 4: new password + confirm password
- Added new password reset challenge backend service:
  - `modules/auth/server/password-reset-challenge.ts`
- Added new API routes:
  - `POST /api/auth/forgot-password/challenge/start`
  - `POST /api/auth/forgot-password/challenge/verify-email`
  - `POST /api/auth/forgot-password/challenge/verify-sms`
  - `POST /api/auth/forgot-password/challenge/complete`
- Added Prisma model + migration for multi-step challenge state:
  - `PasswordResetChallenge`
- Added TR/EN localization keys for the popup flow.
- Redirected `/forgot-password` and `/reset-password` pages to localized login; recovery is now popup-only.

### Verification
- `npm run prisma:generate` -> ✓
- `npm run prisma:migrate:deploy` -> ✓
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero source standardized to auth-side-hero)

### Changed
- Updated auth right-panel image source to `/images/auth/auth-side-hero.jpg`.
- Removed dependency on `/public/images/bg/...` path; `public/images/bg/` is no longer used.
- Restored existing tracked `public/images/auth/auth-hero.jpg` file in repository state to avoid accidental deletion side effects.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image clarity fix while keeping cover)

### Changed
- Kept right panel image `cover` behavior and improved rendering clarity:
  - increased Next.js image quality to `90`
  - corrected `sizes` to match actual right-panel width: `(min-width: 1024px) calc(100vw - 440px), 0px`
- This prevents undersized image selection on wide screens, which previously looked like excessive zoom/blur.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image switched to images/bg/login/login-page.jpg)

### Changed
- Updated auth split-shell right panel image source to `/images/bg/login/login-page.jpg`.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image switched to login-cloud.webp)

### Changed
- Updated auth split-shell right panel image source from `/images/auth/auth-hero.jpg` to `/logo/login-cloud.webp`.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Locale switcher contrast fix for dark auth panel)

### Changed
- Updated `LocaleSwitcher` button styling for better theme contrast and visibility:
  - switched from `ghost` to `outline` variant
  - added explicit foreground/background/border contrast classes for dark auth panel contexts
  - added optional `className` prop for future layout-specific tuning

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image reverted and dark theme enforced)

### Changed
- Reverted auth split hero image source from `/logo/login-page.webp` back to `/images/auth/auth-hero.jpg`.
- Set global default theme to dark (`modules/theme/config.ts`).
- Forced dark theme rendering on auth split shell root for consistent black appearance on login/register pages.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero image source switched to login-page.webp)

### Changed
- Updated auth split hero image source from `/images/auth/auth-hero.jpg` to `/logo/login-page.webp` in `modules/auth/components/auth-split-shell.tsx`.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages: dark split layout redesign)

### Changed
- `auth-split-shell.tsx`: complete redesign — dark forced (`dark` class on root), left panel has logo + locale switcher at top and form centered, right panel uses emerald radial gradient + grid motif + glow blobs + feature list (`highlights`) + badges; no hero image dependency
- `floating-input.tsx`: label background changed `bg-card` → `bg-background` so floating label blends correctly with dark form panel
- `login-form.tsx`: removed in-form logo (now provided by shell)
- `register-form.tsx`: removed in-form logo and unused `Image` import

### Verification
- `npm run lint` → ✓
- `npx tsc --noEmit` → ✓
- `npm test` → 20/20 passed ✓
- `npm run build` → ✓
- `systemctl restart uppoint-cloud.service` → active ✓

---

## 2026-02-28 (Auth hero eyebrow text changed to CLOUD)

### Changed
- Updated auth right-panel eyebrow label from `UPPOINT CLOUD` to `CLOUD` for both TR and EN locale dictionaries.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth hero brand text styling improved)

### Changed
- Improved right-panel hero brand block on auth pages:
  - added white Uppoint logo in the overlay brand row
  - increased and refined `UPPOINT CLOUD` label styling
  - applied subtle glass-style container for better readability over the image

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth left panel controls simplified and top-aligned)

### Changed
- Removed theme toggle button from auth split layout controls.
- Kept only locale switcher in the left panel.
- Moved left panel alignment from centered to top-aligned.
- Updated locale switcher placement to be left-aligned at the top of the left panel.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages switched to full-screen two-panel layout)

### Changed
- Removed card-like outer container from auth split shell and switched to full-screen two-panel layout.
- Left auth panel now spans full height with a clean surface; right panel remains full-bleed hero image on desktop and hidden on mobile.
- Added `surface` mode support to `AuthCard` and set login/register flows to `plain` so auth area is no longer rendered as a standalone card block.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages remove global navbar and move controls into left panel)

### Changed
- Removed global localized navbar rendering from `app/[locale]/layout.tsx` to keep auth pages strictly two-pane.
- Moved locale switcher and theme toggle from top navbar into the auth left panel (`AuthSplitShell`), above the login/register cards.
- Removed auth shell header-offset spacing (`-mt-16`, header-specific top padding) since navbar is no longer rendered.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth split layout updated with full-image right panel)

### Changed
- Updated auth split shell visual style to match requested layout:
  - login/register content stays on the left panel
  - right panel now renders a full-cover hero image on desktop
  - right panel remains hidden on mobile for focused form flow
- Downloaded and added a dedicated auth-side hero image:
  - source: Unsplash
  - file: `public/images/auth/auth-side-hero.jpg`
- Added subtle dark overlay + lightweight dot texture on top of the hero image to keep overlay text readable.
- Kept existing localized auth panel copy and trust badges over the image.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth split layout and subtle textured background)

### Changed
- Implemented split auth layout for localized login/register pages:
  - auth form card remains on the left
  - brand/trust panel is rendered on the right for desktop
  - right panel is hidden on mobile
- Added localized auth side-panel content (TR default, EN secondary):
  - short brand copy
  - trust badges (`7/24 destek`, `Güvenli altyapı`, etc.)
  - concise highlight rows
- Updated auth page background treatment with low-opacity gradient + subtle texture/pattern to reduce empty-space feel without visual noise.
- Kept navbar container transparent so page background remains visible behind header area.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth pages brand motif background)

### Changed
- Added a subtle brand-motif background layer for localized login and register pages to reduce empty visual space while preserving readability.
- Applied subtle radial dotted texture motif placements at auth page corners for stronger brand consistency.
- Kept forgot-password and reset-password pages unchanged for focused flow consistency.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

## 2026-02-28 (Auth flow UX polish and emerald theme tokens)

### Changed
- Updated header logo target from locale root redirect to direct localized login route to remove redirect-jump effect when clicking the brand logo on login pages.
- Updated login flow so `Şifremi unuttum?` / `Forgot password?` is shown only on the password step (after entering email), not on the first identifier step.
- Applied emerald-focused primary/ring tokens for both light and dark themes (`--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring`) in global theme palette.

### Verification
- `npm run lint` -> ✓
- `npm run typecheck` -> ✓
- `npm run test` -> ✓
- `npm run build` -> ✓

---

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
