import { describe, expect, it, vi } from "vitest";

import { softDeleteUser } from "@/modules/auth/server/user-lifecycle";

describe("softDeleteUser", () => {
  it("returns true when soft delete operation succeeds", async () => {
    const now = new Date("2026-03-01T00:00:00.000Z");
    const softDelete = vi.fn().mockResolvedValue(true);

    const result = await softDeleteUser("user_123", {
      now: () => now,
      softDelete,
    });

    expect(result).toBe(true);
    expect(softDelete).toHaveBeenCalledWith({
      userId: "user_123",
      now,
      tombstoneEmail: "deleted+user_123@deleted.invalid",
    });
  });

  it("returns false when user is already deleted or missing", async () => {
    const result = await softDeleteUser("missing_user", {
      now: () => new Date(),
      softDelete: vi.fn().mockResolvedValue(false),
    });

    expect(result).toBe(false);
  });
});
