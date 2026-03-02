import { createHash, createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyInternalRequestAuth } from "@/lib/security/internal-request-auth";

function signRequest(
  secret: string,
  input: { method: string; path: string; timestamp: string; body: string },
): string {
  const bodySha = createHash("sha256").update(input.body).digest("hex");
  const canonical = `${input.method}\n${input.path}\n${input.timestamp}\n${bodySha}`;
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

describe("verifyInternalRequestAuth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid token + signature + fresh timestamp", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";
    const signature = signRequest(signingSecret, {
      method,
      path,
      timestamp,
      body,
    });

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
    });

    expect(verified).not.toBeNull();
    expect(verified?.rawBody).toBe("");
  });

  it("rejects stale timestamps", async () => {
    const method = "POST";
    const path = "/api/internal/audit/security-event";
    const body = JSON.stringify({ action: "edge_host_rejected", requestId: "req_1", path, method });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 601);
    const token = "audit-token-abcdefghijklmnopqrstuvwxyz1234";
    const signingSecret = "audit-signing-secret-abcdefghijklmnopqrstuvwxyz12";
    const signature = signRequest(signingSecret, {
      method,
      path,
      timestamp: staleTimestamp,
      body,
    });

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-audit-token": token,
        "x-internal-request-ts": staleTimestamp,
        "x-internal-request-signature": signature,
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-audit-token",
      expectedToken: token,
      signingSecret,
      maxSkewSeconds: 300,
    });

    expect(verified).toBeNull();
  });

  it("rejects signature mismatches", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signRequest(signingSecret, {
          method,
          path,
          timestamp,
          body: "tampered",
        }),
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
    });

    expect(verified).toBeNull();
  });
});
