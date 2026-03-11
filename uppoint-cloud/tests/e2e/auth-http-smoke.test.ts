import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.E2E_BASE_URL ?? "https://cloud.uppoint.com.tr";
const allowMutations = process.env.E2E_ALLOW_MUTATIONS === "1";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchWithTimeout(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !headers.has("origin")) {
    headers.set("origin", baseUrl);
  }

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
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
      const payload = await healthResponse.json() as { success?: boolean; data?: { status?: string } };
      expect(payload.success).toBe(true);
      expect(payload.data?.status).toBe("ok");
      return;
    }

    // Production may require x-health-token for /api/health.
    expect(healthResponse.status).toBe(401);
    const unauthorizedPayload = await healthResponse.json() as { success?: boolean; error?: string };
    expect(unauthorizedPayload.success).toBe(false);
    expect(unauthorizedPayload.error).toBe("UNAUTHORIZED");

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
    const authorizedPayload = await authorizedHealthResponse.json() as { success?: boolean; data?: { status?: string } };
    expect(authorizedPayload.success).toBe(true);
    expect(authorizedPayload.data?.status).toBe("ok");
  });

  afterAll(async () => {
    // No direct DB cleanup in E2E suite: tests operate via live HTTP only.
  });

  it("serves localized login and register pages with baseline UI markers", async () => {
    const trLoginResponse = await fetchWithTimeout("/tr/login");
    expect(trLoginResponse.status).toBe(200);

    const trLoginHtml = await trLoginResponse.text();
    expect(trLoginHtml).toContain("Oturum aç");
    expect(trLoginHtml).toContain("E-Posta");

    if (baseUrl.startsWith("https://")) {
      const cspHeader = trLoginResponse.headers.get("content-security-policy");
      expect(cspHeader).toContain("script-src 'self' 'nonce-");
      expect(cspHeader).toContain("'strict-dynamic'");
      expect(cspHeader).not.toContain("script-src 'self' 'unsafe-inline'");

      const nonceMatch = cspHeader?.match(/script-src[^;]*'nonce-([^']+)'/);
      expect(nonceMatch).toBeTruthy();
      if (nonceMatch) {
        expect(trLoginHtml).toContain(`nonce="${nonceMatch[1]}"`);
      }
    }

    const trRegisterResponse = await fetchWithTimeout("/tr/register");
    expect(trRegisterResponse.status).toBe(200);
    const trRegisterHtml = await trRegisterResponse.text();
    expect(trRegisterHtml).toContain("Hesap oluştur");

    const enLoginResponse = await fetchWithTimeout("/en/login");
    expect(enLoginResponse.status).toBe(200);
    const enLoginHtml = await enLoginResponse.text();
    expect(enLoginHtml).toContain("Sign in");
    expect(enLoginHtml).toContain("Email");

    const enRegisterResponse = await fetchWithTimeout("/en/register");
    expect(enRegisterResponse.status).toBe(200);
    const enRegisterHtml = await enRegisterResponse.text();
    expect(enRegisterHtml).toContain("Create account");
  });

  it("protects dashboard security route and preserves callback redirect for unauthenticated users", async () => {
    const response = await fetchWithTimeout("/tr/dashboard/security", {
      redirect: "manual",
    });

    expect([302, 307, 308]).toContain(response.status);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/tr/login");
    expect(location).toContain("callbackUrl=");
    expect(decodeURIComponent(location)).toContain("/tr/dashboard/security");
  });

  it.runIf(allowMutations)("returns neutral response for unverified email login challenge", async () => {
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

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      success: boolean;
      data?: { hasChallenge?: boolean; challengeId?: string | null; codeExpiresAt?: string | null };
    };
    expect(payload.success).toBe(true);
    expect(payload.data?.hasChallenge).toBe(false);
    expect(payload.data?.challengeId ?? null).toBeNull();
    expect(payload.data?.codeExpiresAt ?? null).toBeNull();
  });

  it.runIf(allowMutations)("enforces IP-based register rate limit", async () => {
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

  it.runIf(allowMutations)("returns unified error shape for forgot-password challenge validation failures", async () => {
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

  it("returns 410 JSON for deprecated forgot-password legacy endpoints", async () => {
    const response = await fetchWithTimeout("/api/auth/forgot-password/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(410);
    const payload = await response.json() as { success: boolean; error?: string };
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("ENDPOINT_DEPRECATED");
  });
});
