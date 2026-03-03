import "server-only";

import { timingSafeEqual } from "crypto";

const HEX_STRING_PATTERN = /^[a-f0-9]+$/i;

function normalizeString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function timingSafeEqualText(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftBuffer = Buffer.from(normalizeString(left));
  const rightBuffer = Buffer.from(normalizeString(right));

  return (
    leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function timingSafeEqualHex(
  left: string | null | undefined,
  right: string | null | undefined,
  expectedByteLength?: number,
): boolean {
  const normalizedLeft = normalizeString(left).toLowerCase();
  const normalizedRight = normalizeString(right).toLowerCase();

  if (
    normalizedLeft.length === 0
    || normalizedRight.length === 0
    || normalizedLeft.length !== normalizedRight.length
  ) {
    return false;
  }

  if (!HEX_STRING_PATTERN.test(normalizedLeft) || !HEX_STRING_PATTERN.test(normalizedRight)) {
    return false;
  }

  if (expectedByteLength && normalizedLeft.length !== expectedByteLength * 2) {
    return false;
  }

  const leftBuffer = Buffer.from(normalizedLeft, "hex");
  const rightBuffer = Buffer.from(normalizedRight, "hex");

  if (expectedByteLength && leftBuffer.length !== expectedByteLength) {
    return false;
  }

  return (
    leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
  );
}
