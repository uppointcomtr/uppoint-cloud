import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { env } from "@/lib/env";

const PAYLOAD_PREFIX = "enc:v1";
const GCM_IV_LENGTH_BYTES = 12;
const GCM_TAG_LENGTH_BYTES = 16;

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function deriveAes256Key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function getPayloadSecret(): string | null {
  return env.NOTIFICATION_PAYLOAD_SECRET ?? null;
}

export function sealNotificationPayload(plainText: string): string {
  const secret = getPayloadSecret();
  if (!secret) {
    return plainText;
  }

  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveAes256Key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    PAYLOAD_PREFIX,
    toBase64Url(iv),
    toBase64Url(authTag),
    toBase64Url(ciphertext),
  ].join(":");
}

export function openNotificationPayload(storedValue: string): string {
  const prefix = `${PAYLOAD_PREFIX}:`;
  if (!storedValue.startsWith(prefix)) {
    return storedValue;
  }

  const secret = getPayloadSecret();
  if (!secret) {
    throw new Error("NOTIFICATION_PAYLOAD_SECRET is required to decrypt stored notification payload");
  }

  const segments = storedValue.slice(prefix.length).split(":");
  if (segments.length !== 3) {
    throw new Error("Invalid encrypted notification payload format");
  }

  const iv = fromBase64Url(segments[0] ?? "");
  const authTag = fromBase64Url(segments[1] ?? "");
  const ciphertext = fromBase64Url(segments[2] ?? "");

  if (iv.length !== GCM_IV_LENGTH_BYTES || authTag.length !== GCM_TAG_LENGTH_BYTES) {
    throw new Error("Invalid encrypted notification payload segments");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveAes256Key(secret), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
