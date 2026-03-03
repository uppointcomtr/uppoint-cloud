import { describe, expect, it } from "vitest";

import { timingSafeEqualHex, timingSafeEqualText } from "@/lib/security/constant-time";

describe("timingSafeEqualText", () => {
  it("returns true for equal text values", () => {
    expect(timingSafeEqualText("abc123", "abc123")).toBe(true);
  });

  it("returns false for different text values", () => {
    expect(timingSafeEqualText("abc123", "abc124")).toBe(false);
  });

  it("returns false when either side is missing", () => {
    expect(timingSafeEqualText("abc123", null)).toBe(false);
    expect(timingSafeEqualText(undefined, "abc123")).toBe(false);
  });
});

describe("timingSafeEqualHex", () => {
  const goodHex = "a".repeat(64);
  const otherHex = "b".repeat(64);

  it("returns true for equal hex digests", () => {
    expect(timingSafeEqualHex(goodHex, goodHex, 32)).toBe(true);
  });

  it("returns false for different hex digests", () => {
    expect(timingSafeEqualHex(goodHex, otherHex, 32)).toBe(false);
  });

  it("returns false for non-hex content", () => {
    expect(timingSafeEqualHex("not-a-hex-digest", goodHex, 32)).toBe(false);
  });

  it("returns false when expected byte length does not match", () => {
    expect(timingSafeEqualHex(goodHex, goodHex, 16)).toBe(false);
  });
});
