import { describe, expect, it } from "vitest";

import { parseSessionExpiry } from "@/modules/auth/server/session-expiry";

describe("parseSessionExpiry", () => {
  it("returns null for missing or invalid values", () => {
    expect(parseSessionExpiry(undefined)).toBeNull();
    expect(parseSessionExpiry(null)).toBeNull();
    expect(parseSessionExpiry("not-a-date")).toBeNull();
  });

  it("returns a valid Date for ISO strings and Date objects", () => {
    const isoValue = "2026-03-05T12:00:00.000Z";
    const parsedFromString = parseSessionExpiry(isoValue);
    expect(parsedFromString).toBeInstanceOf(Date);
    expect(parsedFromString?.toISOString()).toBe(isoValue);

    const asDate = new Date(isoValue);
    const parsedFromDate = parseSessionExpiry(asDate);
    expect(parsedFromDate).toBeInstanceOf(Date);
    expect(parsedFromDate?.toISOString()).toBe(isoValue);
  });
});
