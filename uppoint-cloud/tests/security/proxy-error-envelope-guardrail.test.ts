import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("proxy error envelope guardrail", () => {
  it("keeps machine-readable code fields for edge rejection responses", () => {
    const proxyPath = path.join(process.cwd(), "proxy.ts");
    const source = readFileSync(proxyPath, "utf8");

    expect(source).toContain('error: "INVALID_HOST_HEADER", code: "INVALID_HOST_HEADER"');
    expect(source).toContain('error: "ORIGIN_NOT_ALLOWED", code: "ORIGIN_NOT_ALLOWED"');
  });
});
