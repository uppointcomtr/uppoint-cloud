import "server-only";

export function parseSessionExpiry(expires: string | Date | null | undefined): Date | null {
  if (!expires) {
    return null;
  }

  const parsed = expires instanceof Date ? expires : new Date(expires);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}
