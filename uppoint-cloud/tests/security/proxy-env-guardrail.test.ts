import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("proxy env guardrail", () => {
  it("reads runtime env from validated proxyEnv helper", () => {
    const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxySource).toContain('import { proxyEnv } from "@/lib/env/proxy"');
    expect(proxySource).not.toMatch(/process\.env\./);
  });
});
