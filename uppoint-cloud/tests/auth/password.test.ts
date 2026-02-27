import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/modules/auth/server/password";

describe("password hashing", () => {
  it("hashes and verifies password values", async () => {
    const hash = await hashPassword("StrongPass!123", 10);

    expect(hash).not.toBe("StrongPass!123");
    await expect(verifyPassword("StrongPass!123", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPass!123", hash)).resolves.toBe(false);
  });
});
