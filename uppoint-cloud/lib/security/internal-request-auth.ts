import "server-only";

import { createHash, createHmac } from "crypto";
import { isIP } from "net";

import { timingSafeEqualText } from "@/lib/security/constant-time";

function equalsConstantTime(provided: string | null, expected: string): boolean {
  return timingSafeEqualText(provided, expected);
}

function toSha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildCanonicalString(input: {
  method: string;
  path: string;
  requestId: string;
  timestamp: string;
  bodySha256Hex: string;
}): string {
  return `${input.method}\n${input.path}\n${input.requestId}\n${input.timestamp}\n${input.bodySha256Hex}`;
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
  requestIdHeaderName?: string;
  requireLoopbackSource?: boolean;
}

export interface VerifiedInternalRequest {
  requestId: string;
  rawBody: string;
}

function parseRequestId(rawRequestId: string | null): string | null {
  if (!rawRequestId) {
    return null;
  }

  const requestId = rawRequestId.trim();
  if (requestId.length < 12 || requestId.length > 128) {
    return null;
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    return null;
  }

  return requestId;
}

function normalizeIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

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

function extractRightmostForwardedIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parts = value
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  return parts[parts.length - 1] ?? null;
}

function isLoopbackIp(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

function isLoopbackSource(request: Request): boolean {
  const requestUrl = new URL(request.url);
  if (isLoopbackIp(normalizeIp(requestUrl.hostname) ?? requestUrl.hostname.toLowerCase())) {
    return true;
  }

  const realIp = normalizeIp(request.headers.get("x-real-ip"));
  if (isLoopbackIp(realIp)) {
    return true;
  }

  const forwardedIp = extractRightmostForwardedIp(request.headers.get("x-forwarded-for"));
  return isLoopbackIp(forwardedIp);
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
  const requestId = parseRequestId(
    input.request.headers.get(input.requestIdHeaderName ?? "x-internal-request-id"),
  );
  if (!timestamp || !signature) {
    return null;
  }
  if (!requestId) {
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
    requestId,
    timestamp,
    bodySha256Hex,
  });
  const expectedSignature = buildHmacSignature(input.signingSecret, canonical);

  if (!equalsConstantTime(signature, expectedSignature)) {
    return null;
  }

  if (input.requireLoopbackSource && !isLoopbackSource(input.request)) {
    return null;
  }

  return { requestId, rawBody };
}
