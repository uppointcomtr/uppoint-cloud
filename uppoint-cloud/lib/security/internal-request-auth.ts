import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";

function equalsConstantTime(provided: string | null, expected: string): boolean {
  const providedBuffer = Buffer.from(provided ?? "");
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function toSha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildCanonicalString(input: {
  method: string;
  path: string;
  timestamp: string;
  bodySha256Hex: string;
}): string {
  return `${input.method}\n${input.path}\n${input.timestamp}\n${input.bodySha256Hex}`;
}

function buildHmacSignature(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

function isFreshTimestamp(timestampRaw: string, maxSkewSeconds: number): boolean {
  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - timestamp) <= maxSkewSeconds;
}

export interface VerifyInternalRequestInput {
  request: Request;
  expectedPath: string;
  tokenHeaderName: string;
  expectedToken: string;
  signingSecret: string;
  maxSkewSeconds?: number;
}

export interface VerifiedInternalRequest {
  rawBody: string;
}

export async function verifyInternalRequestAuth(
  input: VerifyInternalRequestInput,
): Promise<VerifiedInternalRequest | null> {
  if (input.expectedToken.trim().length === 0 || input.signingSecret.trim().length === 0) {
    return null;
  }

  const url = new URL(input.request.url);
  if (url.pathname !== input.expectedPath) {
    return null;
  }

  if (!equalsConstantTime(input.request.headers.get(input.tokenHeaderName), input.expectedToken)) {
    return null;
  }

  const timestamp = input.request.headers.get("x-internal-request-ts");
  const signature = input.request.headers.get("x-internal-request-signature");
  if (!timestamp || !signature) {
    return null;
  }

  if (!isFreshTimestamp(timestamp, input.maxSkewSeconds ?? 300)) {
    return null;
  }

  const rawBody = await input.request.text();
  const bodySha256Hex = toSha256Hex(rawBody);
  const canonical = buildCanonicalString({
    method: input.request.method.toUpperCase(),
    path: input.expectedPath,
    timestamp,
    bodySha256Hex,
  });
  const expectedSignature = buildHmacSignature(input.signingSecret, canonical);

  if (!equalsConstantTime(signature, expectedSignature)) {
    return null;
  }

  return { rawBody };
}
