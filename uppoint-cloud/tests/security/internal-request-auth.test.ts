import { createHash, createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyInternalRequestAuth } from "@/lib/security/internal-request-auth";

function signRequest(
  secret: string,
  input: { method: string; path: string; requestId: string; timestamp: string; body: string },
): string {
  const bodySha = createHash("sha256").update(input.body).digest("hex");
  const canonical = `${input.method}\n${input.path}\n${input.requestId}\n${input.timestamp}\n${bodySha}`;
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
    const requestId = "dispatch-test-request-1234";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp,
      body,
    });

    const request = new Request(`http://127.0.0.1:3000${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
        "x-internal-transport": "loopback-hmac-v1",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).not.toBeNull();
    expect(verified?.requestId).toBe(requestId);
    expect(verified?.rawBody).toBe("");
  });

  it("rejects stale timestamps", async () => {
    const method = "POST";
    const path = "/api/internal/audit/security-event";
    const body = JSON.stringify({ action: "edge_host_rejected", requestId: "req_1", path, method });
    const requestId = "audit-test-request-5678";
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 601);
    const token = "audit-token-abcdefghijklmnopqrstuvwxyz1234";
    const signingSecret = "audit-signing-secret-abcdefghijklmnopqrstuvwxyz12";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp: staleTimestamp,
      body,
    });

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-audit-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": staleTimestamp,
        "x-internal-request-signature": signature,
        "x-internal-transport": "loopback-hmac-v1",
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
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).toBeNull();
  });

  it("rejects signature mismatches", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const requestId = "dispatch-test-request-9999";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signRequest(signingSecret, {
          method,
          path,
          requestId,
          timestamp,
          body: "tampered",
        }),
        "x-internal-transport": "loopback-hmac-v1",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).toBeNull();
  });

  it("rejects requests without internal request id", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const requestId = "dispatch-test-request-abc1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp,
      body,
    });

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
        "x-internal-transport": "loopback-hmac-v1",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).toBeNull();
  });

  it("rejects valid signed requests from non-loopback source when loopback is required", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const requestId = "dispatch-test-request-loopback-block";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp,
      body,
    });

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
        "x-real-ip": "203.0.113.22",
        "x-internal-transport": "loopback-hmac-v1",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
      requireLoopbackSource: true,
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).toBeNull();
  });

  it("accepts valid signed requests from loopback source when loopback is required", async () => {
    const method = "POST";
    const path = "/api/internal/audit/security-event";
    const body = JSON.stringify({ action: "edge_host_rejected", requestId: "req_2", path, method });
    const requestId = "audit-test-request-loopback-pass";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "audit-token-abcdefghijklmnopqrstuvwxyz1234";
    const signingSecret = "audit-signing-secret-abcdefghijklmnopqrstuvwxyz12";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp,
      body,
    });

    const request = new Request(`http://127.0.0.1:3000${path}`, {
      method,
      headers: {
        "x-internal-audit-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
        "x-internal-transport": "loopback-hmac-v1",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-audit-token",
      expectedToken: token,
      signingSecret,
      requireLoopbackSource: true,
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).not.toBeNull();
    expect(verified?.requestId).toBe(requestId);
  });

  it("accepts mtls transport requests from non-loopback source when mTLS headers are verified", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const requestId = "dispatch-test-request-mtls-pass";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp,
      body,
    });

    const request = new Request(`https://cloud.uppoint.com.tr${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
        "x-real-ip": "203.0.113.55",
        "x-internal-transport": "mtls-hmac-v1",
        "x-ssl-client-verify": "SUCCESS",
        "x-ssl-client-serial": "AB:CD:12:34",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
      transportMode: "mtls-hmac-v1",
    });

    expect(verified).not.toBeNull();
    expect(verified?.requestId).toBe(requestId);
  });

  it("rejects requests when transport header does not match expected mode", async () => {
    const method = "POST";
    const path = "/api/internal/notifications/dispatch";
    const body = "";
    const requestId = "dispatch-test-request-transport-mismatch";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "dispatch-token-abcdefghijklmnopqrstuvwxyz12";
    const signingSecret = "dispatch-signing-secret-abcdefghijklmnopqrstuvwxyz";
    const signature = signRequest(signingSecret, {
      method,
      path,
      requestId,
      timestamp,
      body,
    });

    const request = new Request(`http://127.0.0.1:3000${path}`, {
      method,
      headers: {
        "x-internal-dispatch-token": token,
        "x-internal-request-id": requestId,
        "x-internal-request-ts": timestamp,
        "x-internal-request-signature": signature,
        "x-internal-transport": "mtls-hmac-v1",
      },
      body,
    });

    const verified = await verifyInternalRequestAuth({
      request,
      expectedPath: path,
      tokenHeaderName: "x-internal-dispatch-token",
      expectedToken: token,
      signingSecret,
      requireLoopbackSource: true,
      transportMode: "loopback-hmac-v1",
    });

    expect(verified).toBeNull();
  });
});
