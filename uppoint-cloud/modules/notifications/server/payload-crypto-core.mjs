import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

export const PAYLOAD_PREFIX = "enc:v1";
const GCM_IV_LENGTH_BYTES = 12;
const GCM_TAG_LENGTH_BYTES = 16;

function toBase64Url(input) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function deriveAes256Key(secret) {
  return createHash("sha256").update(secret).digest();
}

export function sealNotificationPayloadWithSecret(plainText, secret) {
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

export function openNotificationPayloadWithSecret(storedValue, secret) {
  const prefix = `${PAYLOAD_PREFIX}:`;
  if (!storedValue.startsWith(prefix)) {
    return storedValue;
  }

  const segments = storedValue.slice(prefix.length).split(":");
  if (segments.length !== 3) {
    throw new Error("Invalid encrypted notification payload format");
  }

  const iv = fromBase64Url(segments[0] || "");
  const authTag = fromBase64Url(segments[1] || "");
  const ciphertext = fromBase64Url(segments[2] || "");

  if (iv.length !== GCM_IV_LENGTH_BYTES || authTag.length !== GCM_TAG_LENGTH_BYTES) {
    throw new Error("Invalid encrypted notification payload segments");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveAes256Key(secret), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
