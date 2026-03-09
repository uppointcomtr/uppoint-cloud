import { describe, expect, it } from "vitest";

import {
  NORMAL_SESSION_IDLE_TIMEOUT_SECONDS,
  REMEMBER_ME_SESSION_IDLE_TIMEOUT_SECONDS,
  calculateIdleExpiresAt,
  hasIdleSessionExpired,
  resolveIdleTimeoutSeconds,
} from "@/modules/auth/server/session-policy";

describe("session-policy", () => {
  it("uses 4-hour idle timeout for normal sessions", () => {
    expect(resolveIdleTimeoutSeconds(false)).toBe(NORMAL_SESSION_IDLE_TIMEOUT_SECONDS);
  });

  it("uses 30-day timeout when remember-me is enabled", () => {
    expect(resolveIdleTimeoutSeconds(true)).toBe(REMEMBER_ME_SESSION_IDLE_TIMEOUT_SECONDS);
  });

  it("expires sessions only after configured idle threshold", () => {
    const now = Date.UTC(2026, 2, 8, 12, 0, 0);
    const idleTimeoutSeconds = NORMAL_SESSION_IDLE_TIMEOUT_SECONDS;
    const expiresAt = calculateIdleExpiresAt(now, idleTimeoutSeconds);

    expect(expiresAt).toBe(now + idleTimeoutSeconds * 1000);
    expect(hasIdleSessionExpired(now, now + idleTimeoutSeconds * 1000 - 1, idleTimeoutSeconds)).toBe(false);
    expect(hasIdleSessionExpired(now, now + idleTimeoutSeconds * 1000, idleTimeoutSeconds)).toBe(true);
  });
});
