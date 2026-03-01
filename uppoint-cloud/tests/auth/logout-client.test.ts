import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import { performLogout } from "@/modules/auth/client/logout";

describe("performLogout", () => {
  it("calls logout endpoint first, then signOut", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const signOutImpl = vi.fn().mockResolvedValue(undefined);

    await performLogout({
      callbackUrl: "/tr/login",
      fetchImpl,
      signOutImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(signOutImpl).toHaveBeenCalledWith({ callbackUrl: "/tr/login" });
  });

  it("still signs out when logout endpoint fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const signOutImpl = vi.fn().mockResolvedValue(undefined);

    await performLogout({
      callbackUrl: "/en/login",
      fetchImpl,
      signOutImpl,
    });

    expect(signOutImpl).toHaveBeenCalledWith({ callbackUrl: "/en/login" });
  });
});
