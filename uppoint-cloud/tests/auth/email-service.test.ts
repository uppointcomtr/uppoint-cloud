import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderSharedEmailTemplate } from "@/modules/notifications/server/email-template";

const sendMailMock = vi.fn(async () => undefined);
const createTransportMock = vi.fn(() => ({
  sendMail: sendMailMock,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe("renderSharedEmailTemplate", () => {
  it("renders a shared OTP wrapper with dark-mode support", () => {
    const html = renderSharedEmailTemplate({
      appUrl: "https://cloud.uppoint.com.tr",
      subject: "Uppoint Cloud giriş doğrulama kodu",
      text:
        "Merhaba Semih,\n\n" +
        "Giriş doğrulama kodun: 123456\n" +
        "Kod 3 dakika geçerlidir.\n\n" +
        "Eğer bu işlemi sen başlatmadıysan bu e-postayı yok sayabilirsin.",
    });

    expect(html).toContain('meta name="color-scheme" content="light dark"');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("UPPOINT CLOUD");
    expect(html).toContain("123456");
    expect(html).toContain("cloud.uppoint.com.tr");
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain("Tek kullanımlık doğrulama kodun aşağıdadır.");
    expect(html).not.toContain("Giriş doğrulama kodun: 123456");
    expect(html.match(/123456/g)).toHaveLength(1);
  });

  it("escapes html and preserves multiline operational sections", () => {
    const html = renderSharedEmailTemplate({
      appUrl: "https://cloud.uppoint.com.tr",
      subject: "Report <status>",
      text:
        "Timestamp (UTC): 2026-04-13T12:00:00Z\n" +
        "Host: node-1\n\n" +
        "Output:\n" +
        "line <1>\n" +
        "line 2",
    });

    expect(html).toContain("Report &lt;status&gt;");
    expect(html).toContain("line &lt;1&gt;");
    expect(html).not.toContain("line <1>");
    expect(html).toContain("<pre");
  });
});

describe("sendAuthEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMailMock.mockClear();
    createTransportMock.mockClear();

    Object.assign(process.env, {
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "https://cloud.uppoint.com.tr",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/uppoint_cloud?schema=public",
      AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      UPPOINT_EMAIL_BACKEND: "smtp",
      UPPOINT_DEFAULT_FROM_EMAIL: "no-reply@uppoint.com.tr",
      UPPOINT_EMAIL_HOST: "smtp.example.com",
      UPPOINT_EMAIL_PORT: "587",
      UPPOINT_EMAIL_HOST_USER: "smtp-user",
      UPPOINT_EMAIL_HOST_PASSWORD: "smtp-password",
      UPPOINT_EMAIL_USE_TLS: "true",
      UPPOINT_EMAIL_POOL_MAX_CONNECTIONS: "5",
      UPPOINT_EMAIL_POOL_MAX_MESSAGES: "100",
    });
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key];
      }
    }

    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("sends shared html together with plaintext fallback", async () => {
    const { sendAuthEmail } = await import("@/modules/auth/server/email-service");

    await sendAuthEmail({
      to: "user@example.com",
      subject: "Uppoint Cloud sign-in verification code",
      text: "Hello Sam,\n\nYour sign-in verification code is: 654321\nThe code expires in 3 minutes.",
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
      from: "no-reply@uppoint.com.tr",
      to: "user@example.com",
      subject: "Uppoint Cloud sign-in verification code",
      text: "Hello Sam,\n\nYour sign-in verification code is: 654321\nThe code expires in 3 minutes.",
      html: expect.stringContaining("654321"),
    }));
    const mailPayload = (sendMailMock.mock.calls as unknown[][])[0]?.[0] as { html?: string } | undefined;

    expect(mailPayload?.html).toContain("cloud.uppoint.com.tr");
    expect(mailPayload?.html).toContain("Your one-time verification code is shown below.");
    expect(mailPayload?.html).not.toContain("Your sign-in verification code is: 654321");
    expect(mailPayload?.html?.match(/654321/g)).toHaveLength(1);
  });
});
