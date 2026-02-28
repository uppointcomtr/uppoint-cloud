import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  registerUser,
  RegisterUserError,
  type RegisterUserDependencies,
} from "@/modules/auth/server/register-user";

describe("registerUser", () => {
  function getDependencies(): RegisterUserDependencies {
    return {
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue({
        id: "user_1",
        email: "test@example.com",
        name: "Test User",
        phone: "+905551112233",
      }),
      hashPassword: vi.fn().mockResolvedValue("hashed-password"),
    };
  }

  it("creates a user when email is available", async () => {
    const dependencies = getDependencies();

    const result = await registerUser(
      {
        name: "Test User",
        email: "TEST@EXAMPLE.COM",
        phone: "905551112233",
        password: "StrongPass!123",
      },
      dependencies,
    );

    expect(result.id).toBe("user_1");
    expect(result.phone).toBe("+905551112233");
    expect(dependencies.findUserByEmail).toHaveBeenCalledWith("test@example.com");
    expect(dependencies.hashPassword).toHaveBeenCalledWith("StrongPass!123");
    expect(dependencies.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+905551112233" }),
    );
  });

  it("throws EMAIL_TAKEN for duplicate email", async () => {
    const dependencies = getDependencies();
    vi.mocked(dependencies.findUserByEmail).mockResolvedValueOnce({ id: "existing" });

    await expect(
      registerUser(
        {
          name: "Test User",
          email: "test@example.com",
          phone: "+905551112233",
          password: "StrongPass!123",
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" } satisfies Partial<RegisterUserError>);
  });

  it("rejects invalid payloads", async () => {
    const dependencies = getDependencies();

    await expect(
      registerUser(
        {
          name: "T",
          email: "bad-email",
          password: "weak",
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
