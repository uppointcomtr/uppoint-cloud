import { describe, expect, it } from "vitest";

import { isStaleServerActionError } from "@/lib/errors/stale-server-action";

describe("isStaleServerActionError", () => {
  it("detects stale server-action runtime errors", () => {
    expect(
      isStaleServerActionError(
        new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'),
      ),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isStaleServerActionError(new Error("Some other error"))).toBe(false);
    expect(isStaleServerActionError(undefined)).toBe(false);
  });
});
