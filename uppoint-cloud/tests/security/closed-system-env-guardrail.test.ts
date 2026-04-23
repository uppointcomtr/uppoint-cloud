import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

const baseServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/uppoint_cloud?schema=public",
  NEXT_PUBLIC_APP_URL: "https://cloud.uppoint.com.tr",
  AUTH_SECRET: "a".repeat(32),
  AUTH_OTP_PEPPER: "b".repeat(32),
  INTERNAL_AUDIT_TOKEN: "c".repeat(32),
  INTERNAL_DISPATCH_TOKEN: "d".repeat(32),
  INTERNAL_PROVISIONING_TOKEN: "e".repeat(32),
  INTERNAL_AUDIT_SIGNING_SECRET: "f".repeat(32),
  INTERNAL_DISPATCH_SIGNING_SECRET: "g".repeat(32),
  INTERNAL_PROVISIONING_SIGNING_SECRET: "h".repeat(32),
  NOTIFICATION_PAYLOAD_SECRET: "i".repeat(32),
  AUTH_TRUST_HOST: "true",
  HEALTHCHECK_TOKEN: "j".repeat(16),
  UPPOINT_CLOSED_SYSTEM_MODE: "true",
  RATE_LIMIT_REDIS_URL: "redis://127.0.0.1:6379",
  INCUS_SOCKET_PATH: "/var/lib/incus/unix.socket",
  KVM_WORKER_BATCH_SIZE: "10",
  KVM_WORKER_LOCK_STALE_SECONDS: "180",
  KVM_OVS_BRIDGE_PREFIX: "upkvm",
  KVM_VLAN_RANGE: "2000-2999",
  UPPOINT_EMAIL_BACKEND: "smtp",
  UPPOINT_DEFAULT_FROM_EMAIL: "noreply@uppoint.com.tr",
  UPPOINT_EMAIL_HOST: "smtp.uppoint.com.tr",
  UPPOINT_EMAIL_PORT: "465",
  UPPOINT_EMAIL_HOST_USER: "smtp-user",
  UPPOINT_EMAIL_HOST_PASSWORD: "smtp-password",
  UPPOINT_EMAIL_USE_TLS: "true",
  UPPOINT_SMS_ENABLED: "true",
  UPPOINT_SMS_API_URL: "https://sms.uppoint.com.tr",
  UPPOINT_SMS_USERNAME: "sms-user",
  UPPOINT_SMS_PASSWORD: "sms-password",
  UPPOINT_SMS_SOURCE_ADDR: "UPPOINT",
  AUDIT_LOG_SIGNING_SECRET: "k".repeat(32),
  AUDIT_ANCHOR_SIGNING_SECRET: "l".repeat(32),
};

const baseProxyEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://cloud.uppoint.com.tr",
  AUTH_SECRET: "k".repeat(32),
  UPPOINT_CLOSED_SYSTEM_MODE: "true",
};

const trackedKeys = new Set([
  ...Object.keys(baseServerEnv),
  ...Object.keys(baseProxyEnv),
  "INTERNAL_AUDIT_ENDPOINT_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
]);

function restoreEnv() {
  for (const key of trackedKeys) {
    const originalValue = originalEnv[key];
    if (typeof originalValue === "string") {
      process.env[key] = originalValue;
    } else {
      delete process.env[key];
    }
  }
}

function applyEnv(values: Record<string, string | undefined>) {
  restoreEnv();

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

async function loadServerEnv() {
  vi.resetModules();
  return import("@/lib/env/server");
}

async function loadProxyEnv() {
  vi.resetModules();
  return import("@/lib/env/proxy");
}

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe("closed-system env guardrail", () => {
  it("rejects non-loopback internal audit endpoint overrides in closed-system server env", async () => {
    applyEnv({
      ...baseServerEnv,
      INTERNAL_AUDIT_ENDPOINT_URL: "https://audit.example.com/api/internal/audit/security-event",
    });

    await expect(loadServerEnv()).rejects.toThrow("Invalid environment configuration");
  });

  it("rejects non-loopback incus endpoint overrides in closed-system server env", async () => {
    applyEnv({
      ...baseServerEnv,
      INCUS_SOCKET_PATH: undefined,
      INCUS_ENDPOINT: "https://incus.example.com",
    });

    await expect(loadServerEnv()).rejects.toThrow("Invalid environment configuration");
  });

  it("rejects Upstash rate limiting in closed-system server env", async () => {
    applyEnv({
      ...baseServerEnv,
      UPSTASH_REDIS_REST_URL: "https://tenant.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    });

    await expect(loadServerEnv()).rejects.toThrow("Invalid environment configuration");
  });

  it("allows Upstash rate limiting only when closed-system mode is disabled", async () => {
    applyEnv({
      ...baseServerEnv,
      UPPOINT_CLOSED_SYSTEM_MODE: "false",
      RATE_LIMIT_REDIS_URL: undefined,
      UPSTASH_REDIS_REST_URL: "https://tenant.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    });

    const envModule = await loadServerEnv();
    expect(envModule.env.UPPOINT_CLOSED_SYSTEM_MODE).toBe(false);
    expect(envModule.env.UPSTASH_REDIS_REST_URL).toBe("https://tenant.upstash.io");
  });

  it("rejects non-loopback internal audit endpoint overrides in closed-system proxy env", async () => {
    applyEnv({
      ...baseProxyEnv,
      INTERNAL_AUDIT_ENDPOINT_URL: "https://audit.example.com/api/internal/audit/security-event",
    });

    await expect(loadProxyEnv()).rejects.toThrow("Invalid proxy environment configuration");
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});
