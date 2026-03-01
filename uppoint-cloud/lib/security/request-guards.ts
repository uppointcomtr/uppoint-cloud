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
  return (
    parseHostFromHeader(request.headers.get("x-forwarded-host"))
    ?? parseHostFromHeader(request.headers.get("host"))
  );
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

  // Non-browser clients (curl, probes) may omit Origin.
  if (!originHeader) {
    return true;
  }

  const origin = normalizeOrigin(originHeader);
  if (!origin) {
    return false;
  }

  return allowedOrigins.has(origin);
}
