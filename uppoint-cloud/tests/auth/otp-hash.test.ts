import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { hashOtpCode } from "@/modules/auth/server/otp-hash";

describe("hashOtpCode", () => {
  it("returns deterministic 64-char hex output", () => {
    const code = "123456";
    const first = hashOtpCode(code);
    const second = hashOtpCode(code);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not match plain sha256(code)", () => {
    const code = "123456";
    const plainSha = crypto.createHash("sha256").update(code).digest("hex");

    expect(hashOtpCode(code)).not.toBe(plainSha);
  });
});
