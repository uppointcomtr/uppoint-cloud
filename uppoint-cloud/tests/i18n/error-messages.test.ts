import { describe, expect, it } from "vitest";

import { getErrorMessages, resolveLocaleFromPathname } from "@/modules/i18n/error-messages";

describe("resolveLocaleFromPathname", () => {
  it("extracts locale from localized pathnames", () => {
    expect(resolveLocaleFromPathname("/tr/login")).toBe("tr");
    expect(resolveLocaleFromPathname("/en/register")).toBe("en");
  });

  it("falls back to default locale for unknown paths", () => {
    expect(resolveLocaleFromPathname("/dashboard")).toBe("tr");
    expect(resolveLocaleFromPathname(null)).toBe("tr");
  });
});

describe("getErrorMessages", () => {
  it("returns translated error strings for Turkish and English", () => {
    expect(getErrorMessages("tr").backToLogin).toBe("Giriş sayfasına dön");
    expect(getErrorMessages("en").backToLogin).toBe("Back to login");
    expect(getErrorMessages("tr").refreshPage).toBe("Sayfayı yenile");
    expect(getErrorMessages("en").refreshPage).toBe("Refresh page");
  });
});
