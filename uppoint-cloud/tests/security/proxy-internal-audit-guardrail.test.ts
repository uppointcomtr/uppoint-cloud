import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("proxy internal loopback ingress guardrail", () => {
  it("keeps trusted internal loopback ingress bypass narrow and explicit", () => {
    const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

    expect(proxySource).toContain("function isTrustedInternalLoopbackIngress");
    expect(proxySource).toContain('"/api/internal/audit/security-event": "x-internal-audit-token"');
    expect(proxySource).toContain('"/api/internal/notifications/dispatch": "x-internal-dispatch-token"');
    expect(proxySource).toContain('"/api/internal/instances/provisioning/claim": "x-internal-provisioning-token"');
    expect(proxySource).toContain('"/api/internal/instances/provisioning/report": "x-internal-provisioning-token"');
    expect(proxySource).toContain('request.headers.get("x-real-ip")');
    expect(proxySource).toContain("request.headers.get(tokenHeaderName)");
    expect(proxySource).toContain('request.headers.get("x-internal-request-signature")');
    expect(proxySource).toContain('request.headers.get("x-internal-transport")');
    expect(proxySource).toContain("const trustedInternalLoopbackIngress = isTrustedInternalLoopbackIngress(request, pathname)");
    expect(proxySource).toContain("!trustedInternalLoopbackIngress");
    expect(proxySource).toContain("!trustedLoopbackStaticAssetRequest");
    expect(proxySource).toContain("&& !isAllowedHost(requestHost, ALLOWED_HOSTS)");
    expect(proxySource).toContain("&& isApiMutation(pathname, request.method)");
  });

  it("keeps edge audit emit failures observable", () => {
    const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

    expect(proxySource).toContain('"x-real-ip": "127.0.0.1"');
    expect(proxySource).toContain('"x-internal-transport": INTERNAL_AUTH_TRANSPORT_MODE');
    expect(proxySource).toContain("if (!response.ok)");
    expect(proxySource).toContain("[edge-audit-emit] failed");
  });
});
