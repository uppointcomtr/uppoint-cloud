import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("proxy internal audit ingress guardrail", () => {
  it("keeps trusted internal audit ingress bypass narrow and explicit", () => {
    const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

    expect(proxySource).toContain("function isTrustedInternalAuditIngress");
    expect(proxySource).toContain('pathname !== "/api/internal/audit/security-event"');
    expect(proxySource).toContain('request.headers.get("x-real-ip")');
    expect(proxySource).toContain('request.headers.get("x-internal-audit-token")');
    expect(proxySource).toContain('request.headers.get("x-internal-request-signature")');
    expect(proxySource).toContain('request.headers.get("x-internal-transport")');
    expect(proxySource).toContain('const trustedInternalAuditIngress = isTrustedInternalAuditIngress(request, pathname)');
    expect(proxySource).toContain("!trustedInternalAuditIngress");
    expect(proxySource).toContain("!trustedLoopbackStaticAssetRequest");
    expect(proxySource).toContain("&& !isAllowedHost(requestHost, ALLOWED_HOSTS)");
    expect(proxySource).toContain("&& isApiMutation(pathname, request.method)");
  });

  it("keeps edge audit emit failures observable", () => {
    const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

    expect(proxySource).toContain('"x-real-ip": "127.0.0.1"');
    expect(proxySource).toContain('"x-internal-transport": INTERNAL_AUTH_TRANSPORT_MODE');
    expect(proxySource).toContain("[edge-audit-emit] failed");
  });
});
