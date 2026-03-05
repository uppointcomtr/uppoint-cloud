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

  it("accepts epoch seconds and epoch milliseconds", () => {
    const epochSeconds = 1_772_712_000; // 2026-03-05T12:00:00.000Z
    const epochMilliseconds = 1_772_712_000_000;

    expect(parseSessionExpiry(epochSeconds)?.toISOString()).toBe("2026-03-05T12:00:00.000Z");
    expect(parseSessionExpiry(String(epochSeconds))?.toISOString()).toBe("2026-03-05T12:00:00.000Z");
    expect(parseSessionExpiry(epochMilliseconds)?.toISOString()).toBe("2026-03-05T12:00:00.000Z");
    expect(parseSessionExpiry(String(epochMilliseconds))?.toISOString()).toBe("2026-03-05T12:00:00.000Z");
  });
});
