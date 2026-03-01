import { describe, expect, it } from "vitest";

import * as requestRoute from "@/app/api/auth/forgot-password/request/route";
import * as resetRoute from "@/app/api/auth/forgot-password/reset/route";

describe("deprecated forgot-password routes", () => {
  it("returns 410 for POST /api/auth/forgot-password/request", async () => {
    const response = await requestRoute.POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ENDPOINT_DEPRECATED",
    });
  });

  it("returns 410 for POST /api/auth/forgot-password/reset", async () => {
    const response = await resetRoute.POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ENDPOINT_DEPRECATED",
    });
  });
});
