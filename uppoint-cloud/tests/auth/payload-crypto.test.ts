import { afterEach, describe, expect, it, vi } from "vitest";

describe("notification payload crypto", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unmock("@/lib/env");
  });

  it("encrypts/decrypts payload when secret is configured", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        NOTIFICATION_PAYLOAD_SECRET: "notification-payload-secret-abcdefghijklmnopqrstuvwxyz",
      },
    }));

    const { openNotificationPayload, sealNotificationPayload } = await import(
      "@/modules/notifications/server/payload-crypto"
    );

    const plaintext = "otp=123456";
    const sealed = sealNotificationPayload(plaintext);
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("123456");
    expect(openNotificationPayload(sealed)).toBe(plaintext);
  });

  it("passes through plaintext when secret is not configured", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        NOTIFICATION_PAYLOAD_SECRET: undefined,
      },
    }));

    const { openNotificationPayload, sealNotificationPayload } = await import(
      "@/modules/notifications/server/payload-crypto"
    );

    const plaintext = "plain-message";
    expect(sealNotificationPayload(plaintext)).toBe(plaintext);
    expect(openNotificationPayload(plaintext)).toBe(plaintext);
  });

  it("fails closed for encrypted payload if secret is missing", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        NOTIFICATION_PAYLOAD_SECRET: "notification-payload-secret-abcdefghijklmnopqrstuvwxyz",
      },
    }));
    const firstImport = await import("@/modules/notifications/server/payload-crypto");
    const encrypted = firstImport.sealNotificationPayload("content");

    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        NOTIFICATION_PAYLOAD_SECRET: undefined,
      },
    }));
    const secondImport = await import("@/modules/notifications/server/payload-crypto");

    expect(() => secondImport.openNotificationPayload(encrypted)).toThrow(
      "NOTIFICATION_PAYLOAD_SECRET is required",
    );
  });
});
