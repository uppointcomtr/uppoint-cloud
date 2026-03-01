import "server-only";

import { createHash, randomUUID } from "crypto";
import { isIP } from "net";
import { Prisma } from "@prisma/client";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { createClient, type RedisClientType } from "redis";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";

const upstashConfig = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? {
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }
  : null;

const localRedisUrl = env.RATE_LIMIT_REDIS_URL ?? null;

let localRedisClient: RedisClientType | null = null;
let localRedisConnectPromise: Promise<RedisClientType | null> | null = null;

const upstashRedis = upstashConfig
  ? new Redis({
      url: upstashConfig.url,
      token: upstashConfig.token,
    })
  : null;

const limiterCache = new Map<string, Ratelimit>();
const PRISMA_FALLBACK_CLEANUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const PRISMA_FALLBACK_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let lastPrismaFallbackCleanupAtMs = 0;
let prismaFallbackCleanupRunning = false;

const LOCAL_REDIS_SLIDING_WINDOW_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])
local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[2]) then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  local retry = tonumber(ARGV[3])
  if oldest[2] then
    local resetAt = tonumber(oldest[2]) + tonumber(ARGV[3]) * 1000
    retry = math.ceil((resetAt - tonumber(ARGV[4])) / 1000)
    if retry < 1 then retry = 1 end
  end
  return {0, retry}
end
redis.call("ZADD", KEYS[1], ARGV[4], ARGV[5])
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]))
return {1, 0}
`;

async function getLocalRedisClient(): Promise<RedisClientType | null> {
  if (!localRedisUrl) {
    return null;
  }

  if (localRedisClient?.isOpen) {
    return localRedisClient;
  }

  if (localRedisConnectPromise) {
    return localRedisConnectPromise;
  }

  localRedisConnectPromise = (async () => {
    try {
      if (!localRedisClient) {
        localRedisClient = createClient({ url: localRedisUrl });
        localRedisClient.on("error", (error) => {
          console.error("[rate-limit] Local Redis client error:", error);
        });
      }

      if (!localRedisClient.isOpen) {
        await localRedisClient.connect();
      }

      return localRedisClient;
    } catch (error) {
      console.error("[rate-limit] Unable to connect local Redis, falling back:", error);
      return null;
    } finally {
      localRedisConnectPromise = null;
    }
  })();

  return localRedisConnectPromise;
}

async function checkLocalRedisRateLimit(
  action: string,
  ip: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitCheckResult | null> {
  const redisClient = await getLocalRedisClient();

  if (!redisClient) {
    return null;
  }

  const nowMs = Date.now();
  const windowStartMs = nowMs - windowSeconds * 1000;
  const key = `uppoint:auth:ratelimit:${action}:${ip}`;
  const member = `${nowMs}:${randomUUID()}`;

  try {
    const rawResult = await redisClient.eval(LOCAL_REDIS_SLIDING_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [
        String(windowStartMs),
        String(max),
        String(windowSeconds),
        String(nowMs),
        member,
      ],
    });

    if (!Array.isArray(rawResult) || rawResult.length < 2) {
      throw new Error("Unexpected local Redis rate-limit result");
    }

    const allowedFlag = Number(rawResult[0]);
    const retryAfterSeconds = Math.max(1, Number(rawResult[1]) || windowSeconds);

    return {
      allowed: allowedFlag === 1,
      retryAfterSeconds,
    };
  } catch (error) {
    console.error("[rate-limit] Local Redis eval error, falling back:", action, error);
    return null;
  }
}

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

async function checkPrismaFallbackRateLimit(
  action: string,
  subject: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitCheckResult> {
  const key = `${action}:${subject}`;

  // Serializable transaction prevents check-then-insert races under concurrent attempts.
  for (let retry = 0; retry < 2; retry += 1) {
    const nowMs = Date.now();
    const windowStart = new Date(nowMs - windowSeconds * 1000);

    try {
      const allowed = await prisma.$transaction(
        async (tx) => {
          const count = await tx.rateLimitAttempt.count({
            where: {
              key,
              createdAt: {
                gte: windowStart,
              },
            },
          });

          if (count >= max) {
            return false;
          }

          await tx.rateLimitAttempt.create({ data: { key } });
          return true;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      if (!allowed) {
        return { allowed: false, retryAfterSeconds: windowSeconds };
      }

      schedulePrismaFallbackCleanup(nowMs);
      return { allowed: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2034"
        && retry < 1
      ) {
        continue;
      }

      // Security-sensitive: auth endpoints must not fail open under limiter backend failures.
      console.error("[rate-limit] Database error — failing closed for action:", action, error);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, windowSeconds),
      };
    }
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, windowSeconds),
  };
}

function schedulePrismaFallbackCleanup(nowMs: number): void {
  if (prismaFallbackCleanupRunning) {
    return;
  }

  if (nowMs - lastPrismaFallbackCleanupAtMs < PRISMA_FALLBACK_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastPrismaFallbackCleanupAtMs = nowMs;
  prismaFallbackCleanupRunning = true;
  const cutoff = new Date(nowMs - PRISMA_FALLBACK_CLEANUP_WINDOW_MS);

  prisma.rateLimitAttempt
    .deleteMany({ where: { createdAt: { lt: cutoff } } })
    .catch((error) => {
      console.error("[rate-limit] Prisma fallback cleanup failed:", error);
    })
    .finally(() => {
      prismaFallbackCleanupRunning = false;
    });
}

function normalizeIpAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Strip IPv4 port notation when present (e.g. 203.0.113.5:443)
  const withoutPort = trimmed.match(/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/)
    ? trimmed.replace(/:\d+$/, "")
    : trimmed;

  const normalized = withoutPort.startsWith("::ffff:")
    ? withoutPort.slice("::ffff:".length)
    : withoutPort;

  return isIP(normalized) ? normalized : null;
}

function extractTrustedForwardedIp(value: string): string | null {
  const parts = value
    .split(",")
    .map((part) => normalizeIpAddress(part))
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  // With standard reverse-proxy behavior, the nearest trusted proxy appends its own remote addr.
  // Using the right-most valid IP avoids trusting attacker-controlled left-most values.
  return parts[parts.length - 1] ?? null;
}

export function normalizeRateLimitIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Extracts the real client IP from request headers.
 * Prefers X-Real-IP and falls back to a trusted parse of X-Forwarded-For.
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const realIp = headersList.get("x-real-ip");

  if (realIp) {
    const normalizedRealIp = normalizeIpAddress(realIp);
    if (normalizedRealIp) {
      return normalizedRealIp;
    }
  }

  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    const forwardedIp = extractTrustedForwardedIp(forwarded);
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return "unknown";
}

/**
 * Records an attempt and checks whether the IP is within the allowed rate limit.
 *
  * @param action  Identifier for the action (e.g. "register", "login-email-start")
 * @param subject Client IP or normalized identifier key
  * @param max     Maximum number of attempts allowed within the window
  * @param windowSeconds  Length of the sliding window in seconds
  * @returns true when the request is allowed; false when the limit is exceeded
 */
export async function checkRateLimit(
  action: string,
  subject: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitCheckResult> {
  const localRedisResult = await checkLocalRedisRateLimit(action, subject, max, windowSeconds);

  if (localRedisResult) {
    return localRedisResult;
  }

  const upstashLimiter = getUpstashLimiter(max, windowSeconds);

  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(`${action}:${subject}`);
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));

      return {
        allowed: result.success,
        retryAfterSeconds,
      };
    } catch (error) {
      console.error("[rate-limit] Upstash error, falling back to Prisma:", action, error);
    }
  }

  return checkPrismaFallbackRateLimit(action, subject, max, windowSeconds);
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

/**
 * Convenience wrapper for a secondary identifier-based limit (email/phone/user).
 */
export async function withRateLimitByIdentifier(
  action: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<Response | null> {
  const normalizedIdentifier = normalizeRateLimitIdentifier(identifier);
  const result = await checkRateLimit(action, `id:${normalizedIdentifier}`, max, windowSeconds);

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
