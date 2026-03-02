import { describe, expect, it } from "vitest";

import * as verifyEmailRoute from "@/app/api/auth/verify-email/route";

describe("deprecated verify-email route", () => {
  it("returns 410 for GET /api/auth/verify-email", async () => {
    const response = await verifyEmailRoute.GET();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ENDPOINT_DEPRECATED",
    });
  });

  it("returns 410 for POST /api/auth/verify-email", async () => {
    const response = await verifyEmailRoute.POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ENDPOINT_DEPRECATED",
    });
  });
});
