import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchWithTimeout(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

describe.runIf(process.env.RUN_E2E === "1")("Auth HTTP E2E Smoke", () => {
  const suffix = uniqueSuffix();
  const registerIp = `10.9.8.${Math.floor(Math.random() * 200) + 10}`;
  const registerIpForUnverified = `10.7.6.${Math.floor(Math.random() * 200) + 10}`;
  const email = `e2e-unverified-${suffix}@example.com`;
  const phone = `+90555${suffix.replace(/\D/g, "").slice(-7).padStart(7, "1")}`;
  const password = "StrongPass!123";

  beforeAll(async () => {
    const healthResponse = await fetchWithTimeout("/api/health");

    if (healthResponse.status === 200) {
      const payload = await healthResponse.json() as { status?: string };
      expect(payload.status).toBe("ok");
      return;
    }

    // Production may require x-health-token for /api/health.
    expect(healthResponse.status).toBe(401);
    const unauthorizedPayload = await healthResponse.json() as { status?: string };
    expect(unauthorizedPayload.status).toBe("unauthorized");

    const healthToken = process.env.E2E_HEALTHCHECK_TOKEN ?? process.env.HEALTHCHECK_TOKEN;
    if (!healthToken) {
      return;
    }

    const authorizedHealthResponse = await fetchWithTimeout("/api/health", {
      headers: {
        "x-health-token": healthToken,
      },
    });
    expect(authorizedHealthResponse.status).toBe(200);
    const authorizedPayload = await authorizedHealthResponse.json() as { status?: string };
    expect(authorizedPayload.status).toBe("ok");
  });

  afterAll(async () => {
    // No direct DB cleanup in E2E suite: tests operate via live HTTP only.
  });

  it("serves localized login and register pages", async () => {
    const loginResponse = await fetchWithTimeout("/tr/login");
    expect(loginResponse.status).toBe(200);

    const loginHtml = await loginResponse.text();
    expect(loginHtml).toContain("Oturum aç");

    if (baseUrl.startsWith("https://")) {
      const cspHeader = loginResponse.headers.get("content-security-policy");
      expect(cspHeader).toContain("script-src 'self' 'nonce-");
      expect(cspHeader).toContain("'strict-dynamic'");
      expect(cspHeader).not.toContain("script-src 'self' 'unsafe-inline'");

      const nonceMatch = cspHeader?.match(/script-src[^;]*'nonce-([^']+)'/);
      expect(nonceMatch).toBeTruthy();
      if (nonceMatch) {
        expect(loginHtml).toContain(`nonce="${nonceMatch[1]}"`);
      }
    }

    const registerResponse = await fetchWithTimeout("/tr/register");
    expect(registerResponse.status).toBe(200);
    const registerHtml = await registerResponse.text();
    expect(registerHtml).toContain("Hesap oluştur");
  });

  it("blocks email login challenge for unverified users", async () => {
    const registerResponse = await fetchWithTimeout("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": registerIpForUnverified,
      },
      body: JSON.stringify({
        name: "E2E Unverified",
        email,
        phone,
        password,
        locale: "tr",
      }),
    });
    const registerPayload = await registerResponse.json() as { success: boolean; error?: string };

    if (registerResponse.status !== 201) {
      // In production-like environments, SMTP delivery can reject test inboxes.
      // Shared environments can also return rate-limit responses.
      expect(registerPayload.success).toBe(false);
      expect(["REGISTER_VERIFICATION_START_FAILED", "TOO_MANY_REQUESTS"]).toContain(
        registerPayload.error,
      );
      return;
    }

    expect(registerPayload.success).toBe(true);

    const response = await fetchWithTimeout("/api/auth/login/challenge/email/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        locale: "tr",
      }),
    });

    expect(response.status).toBe(403);
    const payload = await response.json() as { success: boolean; error?: string };
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("enforces IP-based register rate limit", async () => {
    let lastStatus = 0;
    let lastBody = "";

    for (let i = 0; i < 6; i += 1) {
      const response = await fetchWithTimeout("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": registerIp,
        },
        body: JSON.stringify({}),
      });

      lastStatus = response.status;
      lastBody = await response.text();
    }

    expect(lastStatus).toBe(429);
    expect(lastBody).toContain("TOO_MANY_REQUESTS");
  });

  it("returns unified error shape for forgot-password challenge validation failures", async () => {
    const response = await fetchWithTimeout("/api/auth/forgot-password/challenge/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { success: boolean; error?: string };
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("VALIDATION_FAILED");
  });
});
