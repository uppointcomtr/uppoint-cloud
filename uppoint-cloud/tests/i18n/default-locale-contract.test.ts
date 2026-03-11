import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { defaultLocale } from "@/modules/i18n/config";

describe("default locale contract", () => {
  it("keeps Turkish as the default locale", () => {
    expect(defaultLocale).toBe("tr");
  });

  it("resolves root html lang from forwarded locale header with default fallback", () => {
    const layoutPath = path.join(process.cwd(), "app", "layout.tsx");
    const source = readFileSync(layoutPath, "utf8");
    expect(source).toContain('requestHeaders.get("x-uppoint-locale")');
    expect(source).toContain("return defaultLocale;");
    expect(source).toContain("<html lang={htmlLocale} suppressHydrationWarning>");
  });
});
