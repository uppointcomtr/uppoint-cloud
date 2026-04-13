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

  it("does not sign out when logout endpoint fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const signOutImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      performLogout({
        callbackUrl: "/en/login",
        fetchImpl,
        signOutImpl,
      }),
    ).rejects.toMatchObject({ code: "LOGOUT_REQUEST_FAILED" });

    expect(signOutImpl).not.toHaveBeenCalled();
  });

  it("does not sign out when logout endpoint rejects the request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    const signOutImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      performLogout({
        callbackUrl: "/en/login",
        fetchImpl,
        signOutImpl,
      }),
    ).rejects.toMatchObject({ code: "LOGOUT_REJECTED" });

    expect(signOutImpl).not.toHaveBeenCalled();
  });
});
