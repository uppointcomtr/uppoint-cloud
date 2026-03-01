import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/db/client";

/**
 * Extracts the real client IP from request headers.
 * Respects X-Forwarded-For (set by the reverse proxy).
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");

  if (forwarded) {
    // X-Forwarded-For may contain a comma-separated list; take the first entry
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return headersList.get("x-real-ip") ?? "unknown";
}

/**
 * Records an attempt and checks whether the IP is within the allowed rate limit.
 *
 * @param action  Identifier for the action (e.g. "register", "login-email-start")
 * @param ip      Client IP address
 * @param max     Maximum number of attempts allowed within the window
 * @param windowSeconds  Length of the sliding window in seconds
 * @returns true when the request is allowed; false when the limit is exceeded
 */
export async function checkRateLimit(
  action: string,
  ip: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `${action}:${ip}`;
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  try {
    const count = await prisma.rateLimitAttempt.count({
      where: { key, createdAt: { gte: windowStart } },
    });

    if (count >= max) {
      return false;
    }

    await prisma.rateLimitAttempt.create({ data: { key } });

    // Probabilistic cleanup (1% chance) to avoid unbounded table growth
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      prisma.rateLimitAttempt
        .deleteMany({ where: { createdAt: { lt: cutoff } } })
        .catch(() => {
          // fire-and-forget: table cleanup is best-effort
        });
    }

    return true;
  } catch (error) {
    // Fail open: if the database is unreachable, allow the request rather
    // than blocking all users. The application's own error handling will
    // surface any downstream DB failures.
    console.error("[rate-limit] Database error — failing open for action:", action, error);
    return true;
  }
}

/**
 * Convenience function that runs checkRateLimit and returns a 429 Response
 * if the limit is exceeded, or null if the request is allowed.
 */
export async function withRateLimit(
  action: string,
  max: number,
  windowSeconds: number,
): Promise<Response | null> {
  const ip = await getClientIp();
  const allowed = await checkRateLimit(action, ip, max, windowSeconds);

  if (!allowed) {
    return Response.json(
      { success: false, error: "TOO_MANY_REQUESTS" },
      { status: 429 },
    );
  }

  return null;
}
