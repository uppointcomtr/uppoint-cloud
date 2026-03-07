import "server-only";

import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { createClient, type RedisClientType } from "redis";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

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

interface AdaptiveRateLimitContext {
  fingerprintHash: string | null;
  asnBucket: string | null;
}

interface AdaptiveRateLimitInput {
  action: string;
  windowSeconds: number;
  identifier?: string;
  includeDeviceAndAsnSignals?: boolean;
  includeIdentifierDeviceSignal?: boolean;
}

function sanitizeFingerprintInput(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 256) {
    return null;
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function normalizeAsn(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits || digits.length > 10) {
    return null;
  }

  return digits;
}

function buildNetworkBucket(ip: string | null): string | null {
  if (!ip || ip === "unknown") {
    return null;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split(".");
    if (!a || !b) {
      return null;
    }
    return `ipv4:${a}.${b}.0.0/16`;
  }

  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    const bucket = normalized
      .split(":")
      .slice(0, 4)
      .join(":");
    return bucket.length > 0 ? `ipv6:${bucket}::/64` : null;
  }

  return null;
}

function buildRateLimitErrorResponse(input: { retryAfterSeconds: number; max: number; windowSeconds: number }): Response {
  return Response.json(
    { success: false, error: "TOO_MANY_REQUESTS", code: "TOO_MANY_REQUESTS" },
    {
      status: 429,
      headers: {
        "Retry-After": String(input.retryAfterSeconds),
        "X-RateLimit-Limit": String(input.max),
        "X-RateLimit-Window-Seconds": String(input.windowSeconds),
      },
    },
  );
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

export function normalizeRateLimitIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function resolveAdaptiveRateLimitContext(ip: string | null): Promise<AdaptiveRateLimitContext> {
  const headersList = await headers();

  const fingerprintHeader = env.AUTH_DEVICE_FINGERPRINT_HEADER.toLowerCase();
  const asnHeader = env.AUTH_CLIENT_ASN_HEADER.toLowerCase();

  const explicitFingerprint = sanitizeFingerprintInput(headersList.get(fingerprintHeader));
  const fallbackFingerprint = [
    headersList.get("user-agent")?.trim() ?? "",
    headersList.get("accept-language")?.trim() ?? "",
  ].join("|");
  const fingerprintSource = explicitFingerprint ?? fallbackFingerprint;
  const fingerprintHash = fingerprintSource.length > 0
    ? createHash("sha256").update(fingerprintSource).digest("hex")
    : null;

  const explicitAsn = normalizeAsn(
    headersList.get(asnHeader)
      ?? headersList.get("x-asn")
      ?? headersList.get("cf-connecting-asn"),
  );
  const networkBucket = buildNetworkBucket(ip);
  const asnBucket = explicitAsn
    ? `asn:${explicitAsn}`
    : networkBucket
      ? `net:${networkBucket}`
      : null;

  return {
    fingerprintHash,
    asnBucket,
  };
}

async function withAdaptiveRateLimit(input: AdaptiveRateLimitInput): Promise<Response | null> {
  if (!env.AUTH_ADAPTIVE_RATE_LIMIT_ENABLED) {
    return null;
  }

  const resolvedIp = await resolveClientIpFromHeaders();
  if (!resolvedIp && env.NODE_ENV === "production") {
    return Response.json(
      {
        success: false,
        error: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
        code: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  const context = await resolveAdaptiveRateLimitContext(resolvedIp ?? "unknown");
  const adaptiveWindowSeconds = Math.max(60, input.windowSeconds, env.AUTH_ADAPTIVE_WINDOW_SECONDS);
  const adaptiveDeviceMax = env.AUTH_ADAPTIVE_DEVICE_MAX;
  const adaptiveAsnMax = env.AUTH_ADAPTIVE_ASN_MAX;
  const adaptiveIdentifierDeviceMax = env.AUTH_ADAPTIVE_IDENTIFIER_DEVICE_MAX;

  if (input.includeDeviceAndAsnSignals !== false && context.fingerprintHash) {
    const fingerprintResult = await checkRateLimit(
      `${input.action}:adaptive:device`,
      `fp:${context.fingerprintHash}`,
      adaptiveDeviceMax,
      adaptiveWindowSeconds,
    );
    if (!fingerprintResult.allowed) {
      return buildRateLimitErrorResponse({
        retryAfterSeconds: fingerprintResult.retryAfterSeconds ?? adaptiveWindowSeconds,
        max: adaptiveDeviceMax,
        windowSeconds: adaptiveWindowSeconds,
      });
    }
  }

  if (input.includeDeviceAndAsnSignals !== false && context.asnBucket) {
    const asnResult = await checkRateLimit(
      `${input.action}:adaptive:asn`,
      context.asnBucket,
      adaptiveAsnMax,
      adaptiveWindowSeconds,
    );
    if (!asnResult.allowed) {
      return buildRateLimitErrorResponse({
        retryAfterSeconds: asnResult.retryAfterSeconds ?? adaptiveWindowSeconds,
        max: adaptiveAsnMax,
        windowSeconds: adaptiveWindowSeconds,
      });
    }
  }

  if (input.includeIdentifierDeviceSignal !== false && input.identifier && context.fingerprintHash) {
    const normalizedIdentifier = normalizeRateLimitIdentifier(input.identifier);
    const identifierDeviceResult = await checkRateLimit(
      `${input.action}:adaptive:id-device`,
      `id:${normalizedIdentifier}:fp:${context.fingerprintHash}`,
      adaptiveIdentifierDeviceMax,
      adaptiveWindowSeconds,
    );
    if (!identifierDeviceResult.allowed) {
      return buildRateLimitErrorResponse({
        retryAfterSeconds: identifierDeviceResult.retryAfterSeconds ?? adaptiveWindowSeconds,
        max: adaptiveIdentifierDeviceMax,
        windowSeconds: adaptiveWindowSeconds,
      });
    }
  }

  return null;
}

/**
 * Extracts the real client IP from request headers.
 * Prefers X-Real-IP and falls back to a trusted parse of X-Forwarded-For.
 */
async function resolveClientIpFromHeaders(): Promise<string | null> {
  const headersList = await headers();
  return resolveTrustedClientIp({
    realIpHeader: headersList.get("x-real-ip"),
    forwardedForHeader: headersList.get("x-forwarded-for"),
    isProduction: env.NODE_ENV === "production",
  });
}

export async function getClientIp(): Promise<string> {
  const resolvedIp = await resolveClientIpFromHeaders();
  return resolvedIp ?? "unknown";
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
  const ip = await resolveClientIpFromHeaders();

  if (!ip && env.NODE_ENV === "production") {
    // Security-sensitive: production auth endpoints fail closed when trusted client IP cannot be resolved.
    return Response.json(
      {
        success: false,
        error: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
        code: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  const rateLimitSubject = ip ?? "unknown";
  const result = await checkRateLimit(action, rateLimitSubject, max, windowSeconds);

  if (!result.allowed) {
    return buildRateLimitErrorResponse({
      retryAfterSeconds: result.retryAfterSeconds ?? windowSeconds,
      max,
      windowSeconds,
    });
  }

  const adaptiveResponse = await withAdaptiveRateLimit({
    action,
    windowSeconds,
    includeDeviceAndAsnSignals: true,
    includeIdentifierDeviceSignal: false,
  });
  if (adaptiveResponse) {
    return adaptiveResponse;
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
    return buildRateLimitErrorResponse({
      retryAfterSeconds: result.retryAfterSeconds ?? windowSeconds,
      max,
      windowSeconds,
    });
  }

  const adaptiveResponse = await withAdaptiveRateLimit({
    action,
    windowSeconds,
    identifier,
    includeDeviceAndAsnSignals: false,
    includeIdentifierDeviceSignal: true,
  });
  if (adaptiveResponse) {
    return adaptiveResponse;
  }

  return null;
}
