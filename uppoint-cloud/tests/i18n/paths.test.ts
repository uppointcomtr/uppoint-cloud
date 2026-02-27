import { describe, expect, it } from "vitest";

import {
  extractLocaleFromPath,
  stripLocaleFromPath,
  withLocale,
} from "@/modules/i18n/paths";

describe("i18n path helpers", () => {
  it("extracts locale from localized routes", () => {
    expect(extractLocaleFromPath("/tr/login")).toBe("tr");
    expect(extractLocaleFromPath("/en/dashboard")).toBe("en");
    expect(extractLocaleFromPath("/dashboard")).toBeNull();
  });

  it("strips locale prefix from routes", () => {
    expect(stripLocaleFromPath("/tr/login")).toBe("/login");
    expect(stripLocaleFromPath("/en/dashboard/projects")).toBe("/dashboard/projects");
    expect(stripLocaleFromPath("/")).toBe("/");
  });

  it("builds locale-aware routes", () => {
    expect(withLocale("/", "tr")).toBe("/tr");
    expect(withLocale("/login", "en")).toBe("/en/login");
    expect(withLocale("/tr/register", "en")).toBe("/en/register");
  });
});
