import { isIP } from "node:net";

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

function extractRightmostForwardedIp(value: string): string | null {
  const parts = value
    .split(",")
    .map((part) => normalizeIpAddress(part))
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  return parts[parts.length - 1] ?? null;
}

export interface ResolveClientIpInput {
  realIpHeader: string | null;
  forwardedForHeader: string | null;
  isProduction: boolean;
}

export function resolveTrustedClientIp(input: ResolveClientIpInput): string | null {
  if (input.realIpHeader) {
    const normalized = normalizeIpAddress(input.realIpHeader);
    if (normalized) {
      return normalized;
    }
  }

  if (input.isProduction) {
    // Security-sensitive: fail closed in production when authoritative proxy header is missing.
    return null;
  }

  if (!input.forwardedForHeader) {
    return null;
  }

  return extractRightmostForwardedIp(input.forwardedForHeader);
}
