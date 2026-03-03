import "server-only";

import { createHash } from "crypto";
import { isIP } from "net";
import { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import { prisma } from "@/db/client";

const DEFAULT_TTL_SECONDS = 10 * 60;
const DEFAULT_SUBJECT_HASH = "global";
const PENDING_STATUS_CODE = -1;
const PENDING_CONTENT_TYPE = "application/x-idempotency-pending";
const WAIT_FOR_PENDING_MAX_MS = 3_000;
const WAIT_FOR_PENDING_POLL_MS = 100;
const PERSIST_MAX_RETRY_ATTEMPTS = 3;
const PERSIST_RETRY_BASE_DELAY_MS = 50;
const PERSIST_FAILURE_RESERVATION_SECONDS = 24 * 60 * 60;

function normalizeIpAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

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

  return parts[parts.length - 1] ?? null;
}

function normalizeIdempotencyKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

function normalizeSubjectHash(subject: string): string {
  return createHash("sha256").update(subject.trim()).digest("hex");
}

function extractSessionCookieFingerprint(rawCookieHeader: string | null): string | null {
  if (!rawCookieHeader) {
    return null;
  }

  const sessionCookie = rawCookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) =>
      chunk.startsWith("__Secure-next-auth.session-token=")
      || chunk.startsWith("next-auth.session-token="),
    );

  if (!sessionCookie) {
    return null;
  }

  const [, cookieValue] = sessionCookie.split("=", 2);
  return cookieValue?.trim() || null;
}

interface IdempotencyRequestContext {
  key: string | null;
  subjectHash: string;
  usedGlobalFallback: boolean;
}

interface ResolvedSubjectHash {
  value: string;
  usedGlobalFallback: boolean;
}

function resolveSubjectHashFromHeaders(headersList: Headers): ResolvedSubjectHash {
  const explicitScope = headersList.get("x-idempotency-scope")?.trim();
  if (explicitScope && explicitScope.length >= 3 && explicitScope.length <= 256) {
    return {
      value: normalizeSubjectHash(`scope:${explicitScope}`),
      usedGlobalFallback: false,
    };
  }

  const realIp = headersList.get("x-real-ip");
  const forwardedFor = headersList.get("x-forwarded-for");
  const trustedIp = realIp
    ? normalizeIpAddress(realIp)
    : (forwardedFor ? extractTrustedForwardedIp(forwardedFor) : null);
  const userAgent = headersList.get("user-agent")?.trim() || "";
  const sessionCookieFingerprint = extractSessionCookieFingerprint(headersList.get("cookie"));

  if (!trustedIp && !userAgent && !sessionCookieFingerprint) {
    return {
      value: DEFAULT_SUBJECT_HASH,
      usedGlobalFallback: true,
    };
  }

  return {
    value: normalizeSubjectHash(
      [
        `ip:${trustedIp ?? "unknown"}`,
        `ua:${userAgent.slice(0, 255)}`,
        `session:${sessionCookieFingerprint ?? "none"}`,
      ].join("|"),
    ),
    usedGlobalFallback: false,
  };
}

async function getIdempotencyContextFromRequestHeaders(): Promise<IdempotencyRequestContext> {
  const headersList = await headers();
  const idempotencyKey = headersList.get("idempotency-key")?.trim();
  const subjectHash = resolveSubjectHashFromHeaders(headersList);

  if (!idempotencyKey) {
    return {
      key: null,
      subjectHash: subjectHash.value,
      usedGlobalFallback: subjectHash.usedGlobalFallback,
    };
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 256) {
    return {
      key: null,
      subjectHash: subjectHash.value,
      usedGlobalFallback: subjectHash.usedGlobalFallback,
    };
  }

  return {
    key: normalizeIdempotencyKey(idempotencyKey),
    subjectHash: subjectHash.value,
    usedGlobalFallback: subjectHash.usedGlobalFallback,
  };
}

interface StoredIdempotencyRecord {
  statusCode: number;
  contentType: string | null;
  body: string;
  expiresAt: Date;
}

async function readStoredRecord(
  action: string,
  key: string,
  subjectHash: string,
): Promise<StoredIdempotencyRecord | null> {
  return prisma.idempotencyRecord.findUnique({
    where: {
      action_key_subjectHash: {
        action,
        key,
        subjectHash,
      },
    },
    select: {
      statusCode: true,
      contentType: true,
      body: true,
      expiresAt: true,
    },
  });
}

function toReplayResponse(cached: StoredIdempotencyRecord): Response {
  return new Response(cached.body, {
    status: cached.statusCode,
    headers: {
      "Content-Type": cached.contentType ?? "application/json",
      "X-Idempotency-Replayed": "true",
    },
  });
}

async function getCachedResponse(action: string, key: string, subjectHash: string): Promise<Response | null> {
  const cached = await readStoredRecord(action, key, subjectHash);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= new Date()) {
    await prisma.idempotencyRecord.deleteMany({
      where: {
        action,
        key,
        subjectHash,
      },
    }).catch(() => undefined);
    return null;
  }

  if (cached.statusCode === PENDING_STATUS_CODE) {
    return null;
  }

  return toReplayResponse(cached);
}

async function reservePendingSlot(
  action: string,
  key: string,
  subjectHash: string,
  ttlSeconds: number,
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    await prisma.idempotencyRecord.create({
      data: {
        action,
        key,
        subjectHash,
        statusCode: PENDING_STATUS_CODE,
        contentType: PENDING_CONTENT_TYPE,
        body: "",
        expiresAt,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

async function waitForCompletedResponse(
  action: string,
  key: string,
  subjectHash: string,
): Promise<Response | null> {
  const deadline = Date.now() + WAIT_FOR_PENDING_MAX_MS;

  while (Date.now() < deadline) {
    const cached = await readStoredRecord(action, key, subjectHash);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= new Date()) {
      await prisma.idempotencyRecord.deleteMany({
        where: {
          action,
          key,
          subjectHash,
        },
      }).catch(() => undefined);
      return null;
    }

    if (cached.statusCode !== PENDING_STATUS_CODE) {
      return toReplayResponse(cached);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, WAIT_FOR_PENDING_POLL_MS);
    });
  }

  return null;
}

async function persistResponse(
  action: string,
  key: string,
  subjectHash: string,
  response: Response,
  ttlSeconds: number,
): Promise<void> {
  const responseClone = response.clone();
  const body = await responseClone.text();
  const contentType = responseClone.headers.get("content-type");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const updated = await prisma.idempotencyRecord.updateMany({
    where: {
      action,
      key,
      subjectHash,
      statusCode: PENDING_STATUS_CODE,
    },
    data: {
      statusCode: responseClone.status,
      contentType,
      body,
      expiresAt,
    },
  });

  if (updated.count > 0) {
    return;
  }

  await prisma.idempotencyRecord.upsert({
    where: {
      action_key_subjectHash: {
        action,
        key,
        subjectHash,
      },
    },
    create: {
      action,
      key,
      subjectHash,
      statusCode: responseClone.status,
      contentType,
      body,
      expiresAt,
    },
    update: {
      statusCode: responseClone.status,
      contentType,
      body,
      expiresAt,
    },
  });
}

async function persistResponseWithRetry(
  action: string,
  key: string,
  subjectHash: string,
  response: Response,
  ttlSeconds: number,
): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < PERSIST_MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await persistResponse(action, key, subjectHash, response, ttlSeconds);
      return;
    } catch (error) {
      lastError = error;
      const delayMs = PERSIST_RETRY_BASE_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw lastError;
}

async function extendPendingReservationOnPersistFailure(
  action: string,
  key: string,
  subjectHash: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + PERSIST_FAILURE_RESERVATION_SECONDS * 1000);

  await prisma.idempotencyRecord.updateMany({
    where: {
      action,
      key,
      subjectHash,
      statusCode: PENDING_STATUS_CODE,
    },
    data: {
      expiresAt,
    },
  });
}

export async function withIdempotency(
  action: string,
  handler: () => Promise<Response>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<Response> {
  const { key, subjectHash, usedGlobalFallback } = await getIdempotencyContextFromRequestHeaders();

  if (!key) {
    return handler();
  }

  if (process.env.NODE_ENV === "production" && usedGlobalFallback) {
    // Security-sensitive: reject cross-client ambiguous idempotency scope in production.
    return Response.json(
      { success: false, error: "IDEMPOTENCY_SCOPE_UNRESOLVED" },
      { status: 400 },
    );
  }

  const cachedResponse = await getCachedResponse(action, key, subjectHash);
  if (cachedResponse) {
    return cachedResponse;
  }

  let slotAcquired = false;
  try {
    slotAcquired = await reservePendingSlot(action, key, subjectHash, ttlSeconds);
  } catch {
    // Security-sensitive: fail closed when idempotency storage is unavailable.
    return Response.json(
      { success: false, error: "IDEMPOTENCY_STORAGE_UNAVAILABLE" },
      {
        status: 503,
        headers: {
          "Retry-After": "1",
        },
      },
    );
  }

  if (!slotAcquired) {
    const completed = await waitForCompletedResponse(action, key, subjectHash);
    if (completed) {
      return completed;
    }

    return Response.json(
      { success: false, error: "IDEMPOTENCY_IN_PROGRESS" },
      {
        status: 409,
        headers: {
          "Retry-After": "1",
        },
      },
    );
  }

  const response = await handler();
  try {
    await persistResponseWithRetry(action, key, subjectHash, response, ttlSeconds);
  } catch (error) {
    // Security-sensitive: do not silently swallow persistence failures; keep reservation active longer.
    await extendPendingReservationOnPersistFailure(action, key, subjectHash).catch(() => undefined);
    console.error("[idempotency] Failed to persist response cache entry", error);

    try {
      response.headers.set("X-Idempotency-Persisted", "false");
    } catch {
      // Ignore header mutation errors; response body/status remain authoritative.
    }
  }
  return response;
}
