import "server-only";

export const NORMAL_SESSION_IDLE_TIMEOUT_SECONDS = 4 * 60 * 60; // 4 hours
export const REMEMBER_ME_SESSION_IDLE_TIMEOUT_SECONDS = 15 * 24 * 60 * 60; // 15 days
export const SESSION_MAX_AGE_SECONDS = REMEMBER_ME_SESSION_IDLE_TIMEOUT_SECONDS;

export function resolveIdleTimeoutSeconds(rememberMe: boolean): number {
  return rememberMe
    ? REMEMBER_ME_SESSION_IDLE_TIMEOUT_SECONDS
    : NORMAL_SESSION_IDLE_TIMEOUT_SECONDS;
}

export function calculateIdleExpiresAt(
  nowMs: number,
  idleTimeoutSeconds: number,
): number {
  return nowMs + idleTimeoutSeconds * 1000;
}

export function hasIdleSessionExpired(
  lastActivityAtMs: number,
  nowMs: number,
  idleTimeoutSeconds: number,
): boolean {
  return nowMs - lastActivityAtMs >= idleTimeoutSeconds * 1000;
}
