import "server-only";

function normalizeEpochTimestamp(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  // Accept both epoch seconds and epoch milliseconds.
  const millis = value < 1_000_000_000_000 ? value * 1000 : value;
  const parsed = new Date(millis);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function parseSessionExpiry(
  expires: string | number | Date | null | undefined,
): Date | null {
  if (expires === null || expires === undefined) {
    return null;
  }

  if (expires instanceof Date) {
    if (Number.isNaN(expires.getTime())) {
      return null;
    }

    return expires;
  }

  if (typeof expires === "number") {
    return normalizeEpochTimestamp(expires);
  }

  const normalized = expires.trim();
  if (normalized.length === 0) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return normalizeEpochTimestamp(Number(normalized));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}
