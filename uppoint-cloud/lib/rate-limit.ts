import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";

const upstashConfig = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? {
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }
  : null;

const upstashRedis = upstashConfig
  ? new Redis({
      url: upstashConfig.url,
      token: upstashConfig.token,
    })
  : null;

const limiterCache = new Map<string, Ratelimit>();

function getUpstashLimiter(max: number, windowSeconds: number): Ratelimit | null {
  if (!upstashRedis) {
    return null;
  }

  const key = `${max}:${windowSeconds}`;
  const existing = limiterCache.get(key);

  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis: upstashRedis,
    limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
    analytics: false,
    prefix: "uppoint:auth:ratelimit",
  });

  limiterCache.set(key, limiter);
  return limiter;
}

interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

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
): Promise<RateLimitCheckResult> {
  const upstashLimiter = getUpstashLimiter(max, windowSeconds);

  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(`${action}:${ip}`);
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));

      return {
        allowed: result.success,
        retryAfterSeconds,
      };
    } catch (error) {
      console.error("[rate-limit] Upstash error, falling back to Prisma:", action, error);
    }
  }

  const key = `${action}:${ip}`;
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  try {
    const count = await prisma.rateLimitAttempt.count({
      where: { key, createdAt: { gte: windowStart } },
    });

    if (count >= max) {
      return { allowed: false, retryAfterSeconds: windowSeconds };
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

    return { allowed: true };
  } catch (error) {
    // Fail open: if the database is unreachable, allow the request rather
    // than blocking all users. The application's own error handling will
    // surface any downstream DB failures.
    console.error("[rate-limit] Database error — failing open for action:", action, error);
    return { allowed: true };
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
  const result = await checkRateLimit(action, ip, max, windowSeconds);

  if (!result.allowed) {
    const retryAfter = result.retryAfterSeconds ?? windowSeconds;

    return Response.json(
      { success: false, error: "TOO_MANY_REQUESTS" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Window-Seconds": String(windowSeconds),
        },
      },
    );
  }

  return null;
}
