import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("adaptive rate-limit config boundary", () => {
  it("does not read adaptive auth settings directly from process.env in rate-limit module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/rate-limit.ts"), "utf8");

    expect(source).not.toMatch(/process\.env\.AUTH_ADAPTIVE_RATE_LIMIT_ENABLED/);
    expect(source).not.toMatch(/process\.env\.AUTH_DEVICE_FINGERPRINT_HEADER/);
    expect(source).not.toMatch(/process\.env\.AUTH_CLIENT_ASN_HEADER/);
    expect(source).not.toMatch(/process\.env\.AUTH_ADAPTIVE_WINDOW_SECONDS/);
    expect(source).not.toMatch(/process\.env\.AUTH_ADAPTIVE_DEVICE_MAX/);
    expect(source).not.toMatch(/process\.env\.AUTH_ADAPTIVE_ASN_MAX/);
    expect(source).not.toMatch(/process\.env\.AUTH_ADAPTIVE_IDENTIFIER_DEVICE_MAX/);
  });

  it("declares adaptive auth settings in centralized server env schema", () => {
    const envSource = readFileSync(path.join(process.cwd(), "lib/env/server.ts"), "utf8");

    expect(envSource).toContain("AUTH_ADAPTIVE_RATE_LIMIT_ENABLED");
    expect(envSource).toContain("AUTH_DEVICE_FINGERPRINT_HEADER");
    expect(envSource).toContain("AUTH_CLIENT_ASN_HEADER");
    expect(envSource).toContain("AUTH_ADAPTIVE_WINDOW_SECONDS");
    expect(envSource).toContain("AUTH_ADAPTIVE_DEVICE_MAX");
    expect(envSource).toContain("AUTH_ADAPTIVE_ASN_MAX");
    expect(envSource).toContain("AUTH_ADAPTIVE_IDENTIFIER_DEVICE_MAX");
  });
});
