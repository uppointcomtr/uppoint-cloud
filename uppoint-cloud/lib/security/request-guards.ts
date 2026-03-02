export interface AllowedSourceConfig {
  appUrl?: string;
  configuredHosts?: string;
  configuredOrigins?: string;
}

function parseCsv(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeHost(input: string): string {
  return input.trim().toLowerCase();
}

function normalizeOrigin(input: string): string | null {
  try {
    return new URL(input).origin.toLowerCase();
  } catch {
    return null;
  }
}

function parseHostFromHeader(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const candidate = input.split(",")[0]?.trim();
  if (!candidate) {
    return null;
  }

  return normalizeHost(candidate);
}

export function resolveAllowedHosts(config: AllowedSourceConfig): Set<string> {
  const hosts = new Set<string>();
  const configuredHosts = parseCsv(config.configuredHosts);

  for (const host of configuredHosts) {
    hosts.add(normalizeHost(host));
  }

  if (config.appUrl) {
    try {
      hosts.add(new URL(config.appUrl).host.toLowerCase());
    } catch {
      // invalid appUrl validation is handled by env schema
    }
  }

  return hosts;
}

export function resolveAllowedOrigins(config: AllowedSourceConfig): Set<string> {
  const origins = new Set<string>();
  const configuredOrigins = parseCsv(config.configuredOrigins);

  for (const origin of configuredOrigins) {
    const normalized = normalizeOrigin(origin);
    if (normalized) {
      origins.add(normalized);
    }
  }

  if (config.appUrl) {
    const normalized = normalizeOrigin(config.appUrl);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

export function getRequestHost(request: Request): string | null {
  // Security-sensitive: Host is authoritative at app boundary; do not trust forwarded-host as source of truth.
  return parseHostFromHeader(request.headers.get("host"));
}

export function hasConflictingForwardedHost(request: Request): boolean {
  const directHost = parseHostFromHeader(request.headers.get("host"));
  const forwardedHost = parseHostFromHeader(request.headers.get("x-forwarded-host"));

  if (!directHost || !forwardedHost) {
    return false;
  }

  return normalizeHost(directHost) !== normalizeHost(forwardedHost);
}

export function isAllowedHost(requestHost: string | null, allowedHosts: Set<string>): boolean {
  if (allowedHosts.size === 0) {
    return true;
  }

  if (!requestHost) {
    return false;
  }

  return allowedHosts.has(normalizeHost(requestHost));
}

export function isAllowedOrigin(originHeader: string | null, allowedOrigins: Set<string>): boolean {
  if (allowedOrigins.size === 0) {
    return true;
  }

  // Security-sensitive: mutating endpoints should fail closed when Origin is missing.
  if (!originHeader) {
    return false;
  }

  const origin = normalizeOrigin(originHeader);
  if (!origin) {
    return false;
  }

  return allowedOrigins.has(origin);
}
