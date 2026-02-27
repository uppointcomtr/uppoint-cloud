import { describe, expect, it, vi } from "vitest";

import { authenticateUser } from "@/modules/auth/server/authenticate-user";

describe("authenticateUser", () => {
  it("returns null when validation fails", async () => {
    const result = await authenticateUser({}, {
      findUserByEmail: vi.fn(),
      verifyPassword: vi.fn(),
    });

    expect(result).toBeNull();
  });

  it("returns null when user is not found", async () => {
    const result = await authenticateUser(
      { email: "user@example.com", password: "StrongPass!123" },
      {
        findUserByEmail: vi.fn().mockResolvedValue(null),
        verifyPassword: vi.fn(),
      },
    );

    expect(result).toBeNull();
  });

  it("returns user when credentials are valid", async () => {
    const result = await authenticateUser(
      { email: "user@example.com", password: "StrongPass!123" },
      {
        findUserByEmail: vi.fn().mockResolvedValue({
          id: "u1",
          email: "user@example.com",
          name: "User",
          passwordHash: "hash",
        }),
        verifyPassword: vi.fn().mockResolvedValue(true),
      },
    );

    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "User",
    });
  });
});
