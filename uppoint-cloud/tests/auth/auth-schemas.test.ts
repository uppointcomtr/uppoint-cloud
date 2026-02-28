import { describe, expect, it } from "vitest";

import { getLoginSchema } from "@/modules/auth/schemas/auth-schemas";

describe("auth schemas localization", () => {
  it("returns Turkish email validation message for tr locale", () => {
    const result = getLoginSchema("tr").safeParse({
      email: "not-an-email",
      password: "StrongPass!123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Geçerli bir e-posta adresi girin");
    }
  });

  it("returns English email validation message for en locale", () => {
    const result = getLoginSchema("en").safeParse({
      email: "not-an-email",
      password: "StrongPass!123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter a valid email address");
    }
  });
});
