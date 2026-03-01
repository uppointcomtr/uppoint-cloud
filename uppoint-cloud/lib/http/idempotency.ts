import "server-only";

import { createHash } from "crypto";
import { isIP } from "net";
import { headers } from "next/headers";

import { prisma } from "@/db/client";

const DEFAULT_TTL_SECONDS = 10 * 60;
const DEFAULT_SUBJECT_HASH = "global";

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

function resolveSubjectHashFromHeaders(headersList: Headers): string {
  const explicitScope = headersList.get("x-idempotency-scope")?.trim();
  if (explicitScope && explicitScope.length >= 3 && explicitScope.length <= 256) {
    return normalizeSubjectHash(`scope:${explicitScope}`);
  }

  const realIp = headersList.get("x-real-ip");
  const forwardedFor = headersList.get("x-forwarded-for");
  const trustedIp = realIp
    ? normalizeIpAddress(realIp)
    : (forwardedFor ? extractTrustedForwardedIp(forwardedFor) : null);
  const userAgent = headersList.get("user-agent")?.trim() || "";
  const sessionCookieFingerprint = extractSessionCookieFingerprint(headersList.get("cookie"));

  if (!trustedIp && !userAgent && !sessionCookieFingerprint) {
    return DEFAULT_SUBJECT_HASH;
  }

  return normalizeSubjectHash(
    [
      `ip:${trustedIp ?? "unknown"}`,
      `ua:${userAgent.slice(0, 255)}`,
      `session:${sessionCookieFingerprint ?? "none"}`,
    ].join("|"),
  );
}

interface IdempotencyRequestContext {
  key: string | null;
  subjectHash: string;
}

async function getIdempotencyContextFromRequestHeaders(): Promise<IdempotencyRequestContext> {
  const headersList = await headers();
  const idempotencyKey = headersList.get("idempotency-key")?.trim();
  const subjectHash = resolveSubjectHashFromHeaders(headersList);

  if (!idempotencyKey) {
    return {
      key: null,
      subjectHash,
    };
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 256) {
    return {
      key: null,
      subjectHash,
    };
  }

  return {
    key: normalizeIdempotencyKey(idempotencyKey),
    subjectHash,
  };
}

async function getCachedResponse(action: string, key: string, subjectHash: string): Promise<Response | null> {
  const cached = await prisma.idempotencyRecord.findUnique({
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

  return new Response(cached.body, {
    status: cached.statusCode,
    headers: {
      "Content-Type": cached.contentType ?? "application/json",
      "X-Idempotency-Replayed": "true",
    },
  });
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

export async function withIdempotency(
  action: string,
  handler: () => Promise<Response>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<Response> {
  const { key, subjectHash } = await getIdempotencyContextFromRequestHeaders();

  if (!key) {
    return handler();
  }

  const cachedResponse = await getCachedResponse(action, key, subjectHash);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await handler();
  await persistResponse(action, key, subjectHash, response, ttlSeconds).catch(() => undefined);
  return response;
}
