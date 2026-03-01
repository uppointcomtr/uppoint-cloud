import "server-only";

import crypto from "crypto";

/**
 * Generates an opaque challenge identifier that mimics the shape of a DB id.
 * The value is intentionally non-resolvable and never persisted.
 */
export function generateOpaqueChallengeId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(24);
  let suffix = "";

  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }

  return `c${suffix}`;
}

export function getOpaqueChallengeExpiresAt(ttlMinutes: number): Date {
  return new Date(Date.now() + ttlMinutes * 60 * 1000);
}
