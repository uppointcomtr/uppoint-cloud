import "server-only";

import { randomUUID } from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { createClient, type RedisClientType } from "redis";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";

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
  const localRedisResult = await checkLocalRedisRateLimit(action, ip, max, windowSeconds);

  if (localRedisResult) {
    return localRedisResult;
  }

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
