import "server-only";

import { createHash } from "crypto";
import { headers } from "next/headers";

import { prisma } from "@/db/client";

const DEFAULT_TTL_SECONDS = 10 * 60;

function normalizeIdempotencyKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

async function getIdempotencyKeyFromRequestHeaders(): Promise<string | null> {
  const headersList = await headers();
  const idempotencyKey = headersList.get("idempotency-key")?.trim();

  if (!idempotencyKey) {
    return null;
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 256) {
    return null;
  }

  return normalizeIdempotencyKey(idempotencyKey);
}

async function getCachedResponse(action: string, key: string): Promise<Response | null> {
  const cached = await prisma.idempotencyRecord.findUnique({
    where: {
      action_key: {
        action,
        key,
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
  response: Response,
  ttlSeconds: number,
): Promise<void> {
  const responseClone = response.clone();
  const body = await responseClone.text();
  const contentType = responseClone.headers.get("content-type");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.idempotencyRecord.upsert({
    where: {
      action_key: {
        action,
        key,
      },
    },
    create: {
      action,
      key,
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
  const key = await getIdempotencyKeyFromRequestHeaders();

  if (!key) {
    return handler();
  }

  const cachedResponse = await getCachedResponse(action, key);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await handler();
  await persistResponse(action, key, response, ttlSeconds).catch(() => undefined);
  return response;
}
