import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { defaultLocale } from "@/modules/i18n/config";

describe("default locale contract", () => {
  it("keeps Turkish as the default locale", () => {
    expect(defaultLocale).toBe("tr");
  });

  it("uses default locale in root html lang attribute", () => {
    const layoutPath = path.join(process.cwd(), "app", "layout.tsx");
    const source = readFileSync(layoutPath, "utf8");
    expect(source).toContain("<html lang={defaultLocale} suppressHydrationWarning>");
  });
});
