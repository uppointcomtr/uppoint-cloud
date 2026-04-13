import "server-only";

interface SharedEmailTemplateInput {
  appUrl: string;
  subject: string;
  text: string;
}

const DEFAULT_BRAND_NAME = "Uppoint Cloud";
const DEFAULT_HOSTNAME = "cloud.uppoint.com.tr";
const OTP_HINT_PATTERN = /\b(code|otp|verification|verify|kod|dogrulama|doğrulama)\b/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildPreviewText(subject: string, text: string): string {
  const bodyPreview = collapseWhitespace(normalizeLineEndings(text));

  if (bodyPreview.length > 0) {
    return truncate(bodyPreview, 140);
  }

  return truncate(collapseWhitespace(subject) || DEFAULT_BRAND_NAME, 140);
}

function buildOtpLeadText(lang: "tr" | "en"): string {
  if (lang === "tr") {
    return "Tek kullanımlık doğrulama kodun aşağıdadır. Bu kodu yalnızca güvenli giriş ekranında kullan.";
  }

  return "Your one-time verification code is shown below. Use it only on the secure sign-in screen.";
}

function resolveAppInfo(appUrl: string): { origin: string; host: string } {
  try {
    const url = new URL(appUrl);
    return {
      origin: url.origin,
      host: url.host || DEFAULT_HOSTNAME,
    };
  } catch {
    return {
      origin: `https://${DEFAULT_HOSTNAME}`,
      host: DEFAULT_HOSTNAME,
    };
  }
}

function detectEmailLanguage(subject: string, text: string): "tr" | "en" {
  const combined = `${subject}\n${text}`.toLowerCase();

  if (/[çğıöşü]/i.test(combined)) {
    return "tr";
  }

  if (/(merhaba|şifre|sifre|hesap|e-posta|dogrulama|doğrulama|giris|giriş|degisikligi|değişikliği)/i.test(combined)) {
    return "tr";
  }

  return "en";
}

function extractOtpCode(subject: string, text: string): string | null {
  if (!OTP_HINT_PATTERN.test(`${subject}\n${text}`)) {
    return null;
  }

  return text.match(/\b\d{6}\b/u)?.[0] ?? null;
}

function splitBodySections(text: string): string[] {
  const normalized = normalizeLineEndings(text).trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/u)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);
}

function removeOtpLine(section: string, otpCode: string): string {
  const lines = normalizeLineEndings(section).split("\n");
  const filtered = lines.filter((line) => {
    const normalized = collapseWhitespace(line);

    if (normalized.length === 0) {
      return true;
    }

    if (line.includes(otpCode)) {
      return false;
    }

    const lowered = normalized.toLowerCase();
    if (!OTP_HINT_PATTERN.test(lowered)) {
      return true;
    }

    return !/\b\d{6}\b/u.test(line);
  });

  return filtered.join("\n").trim();
}

function prepareSectionsForRendering(text: string, otpCode: string | null): string[] {
  const sections = splitBodySections(text);

  if (!otpCode) {
    return sections;
  }

  const sanitizedSections = sections
    .map((section) => removeOtpLine(section, otpCode))
    .filter((section) => section.length > 0);

  return sanitizedSections.length > 0 ? sanitizedSections : sections;
}

function isPreformattedSection(section: string): boolean {
  const lines = normalizeLineEndings(section).split("\n");

  return section.startsWith("Output:\n") || section.startsWith("Çıktı:\n") || lines.length >= 5;
}

function renderSection(section: string): string {
  const escapedSection = escapeHtml(section);

  if (isPreformattedSection(section)) {
    return [
      '<tr>',
      '<td style="padding:0 0 16px 0;">',
      `<pre class="email-pre" style="margin:0; white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere; border:1px solid #dbe3ea; border-radius:20px; background:#f8fafc; color:#1e293b; padding:18px 20px; font: 13px/1.65 SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;">${escapedSection}</pre>`,
      "</td>",
      "</tr>",
    ].join("");
  }

  return [
    "<tr>",
    '<td style="padding:0 0 16px 0;">',
    `<p class="email-paragraph" style="margin:0; color:#334155; font-size:16px; line-height:1.75; font-family:Arial, Helvetica, sans-serif;">${escapedSection.replaceAll("\n", "<br />")}</p>`,
    "</td>",
    "</tr>",
  ].join("");
}

export function renderSharedEmailTemplate(input: SharedEmailTemplateInput): string {
  const subject = collapseWhitespace(input.subject) || DEFAULT_BRAND_NAME;
  const bodyText = normalizeLineEndings(input.text).trim();
  const lang = detectEmailLanguage(subject, bodyText);
  const otpCode = extractOtpCode(subject, bodyText);
  const sections = prepareSectionsForRendering(bodyText, otpCode);
  const previewText = otpCode ? buildOtpLeadText(lang) : buildPreviewText(subject, bodyText);
  const appInfo = resolveAppInfo(input.appUrl);
  const bodyMarkup = sections.length > 0
    ? sections.map((section) => renderSection(section)).join("")
    : renderSection(subject);

  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="color-scheme" content="light dark" />',
    '<meta name="supported-color-schemes" content="light dark" />',
    `<title>${escapeHtml(subject)}</title>`,
    "<style>",
    ":root { color-scheme: light dark; supported-color-schemes: light dark; }",
    "@media (prefers-color-scheme: dark) {",
    "  body, .email-page { background: #07111f !important; }",
    "  .email-card { background: #0f1a2c !important; border-color: #21314c !important; box-shadow: none !important; }",
    "  .email-hero { background: linear-gradient(180deg, rgba(37, 99, 235, 0.24) 0%, rgba(15, 23, 42, 0) 100%) !important; border-bottom-color: #21314c !important; }",
    "  .email-title, .email-heading, .email-code, .email-pre { color: #f8fafc !important; }",
    "  .email-kicker, .email-lead, .email-paragraph, .email-footer { color: #cbd5e1 !important; }",
    "  .email-code-shell, .email-pre { background: #12233b !important; border-color: #2c4367 !important; }",
    "  .email-link { color: #93c5fd !important; }",
    "}",
    "</style>",
    "</head>",
    '<body style="margin:0; padding:0; background:#eef2f7;">',
    `<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(previewText)}</div>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-page" style="width:100%; border-collapse:collapse; background:#eef2f7;">',
    "<tr>",
    '<td align="center" style="padding:32px 16px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:680px; border-collapse:collapse;">',
    "<tr>",
    '<td style="padding:0;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width:100%; border-collapse:separate; border-spacing:0; background:#ffffff; border:1px solid #dbe3ea; border-radius:28px; overflow:hidden; box-shadow:0 24px 60px rgba(15, 23, 42, 0.08);">',
    "<tr>",
    '<td class="email-hero" style="padding:28px 32px 24px; background:linear-gradient(180deg, rgba(37, 99, 235, 0.08) 0%, rgba(255, 255, 255, 0) 100%); border-bottom:1px solid #e2e8f0;">',
    '<div class="email-kicker" style="font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:1.4; letter-spacing:0.18em; font-weight:700; text-transform:uppercase; color:#0f766e;">UPPOINT CLOUD</div>',
    `<div class="email-lead" style="margin-top:10px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#64748b;">${escapeHtml(appInfo.host)}</div>`,
    `<h1 class="email-title" style="margin:18px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:1.2; font-weight:700; letter-spacing:-0.02em; color:#0f172a;">${escapeHtml(subject)}</h1>`,
    `<p class="email-lead" style="margin:14px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#64748b;">${escapeHtml(previewText)}</p>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:28px 32px 8px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse;">',
    otpCode
      ? [
          "<tr>",
          '<td style="padding:0 0 20px 0;">',
          '<div class="email-code-shell" style="border:1px solid #cfe0f4; border-radius:22px; background:#f8fbff; padding:18px 20px; text-align:center;">',
          `<div class="email-code" style="font-family:SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; font-size:32px; line-height:1.15; letter-spacing:0.32em; font-weight:700; color:#0f172a;">${escapeHtml(otpCode)}</div>`,
          "</div>",
          "</td>",
          "</tr>",
        ].join("")
      : "",
    bodyMarkup,
    "</table>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:0 32px 32px;">',
    '<div style="height:1px; background:#e2e8f0; margin-bottom:18px;"></div>',
    '<p class="email-footer" style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.7; color:#64748b;">',
    `<a class="email-link" href="${escapeAttribute(appInfo.origin)}" style="color:#2563eb; text-decoration:none;">${escapeHtml(appInfo.host)}</a>`,
    "</p>",
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}
