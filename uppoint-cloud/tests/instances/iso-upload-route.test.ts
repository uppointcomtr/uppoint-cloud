import { describe, expect, it } from "vitest";

import * as isoUploadRoute from "@/app/api/instances/iso-images/route";

describe("instance ISO upload route", () => {
  it("keeps user image uploads disabled at the API boundary", async () => {
    const response = await isoUploadRoute.POST();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "IMAGE_UPLOAD_DISABLED",
      code: "IMAGE_UPLOAD_DISABLED",
    });
  });
});
