import "server-only";

type SafeServerErrorContextValue = boolean | number | string | null | undefined;

export interface SafeServerErrorContext {
  [key: string]: SafeServerErrorContextValue;
}

interface NormalizedServerError {
  type: string;
  name?: string;
  message?: string;
  code?: string;
}

function truncate(value: string, maxLength = 200): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeServerError(error: unknown): NormalizedServerError {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;

    return {
      type: "error_instance",
      name: truncate(error.name || "Error", 100),
      message: truncate(error.message || "Unknown error", 500),
      code:
        typeof code === "string" || typeof code === "number"
          ? truncate(String(code), 100)
          : undefined,
    };
  }

  if (typeof error === "string") {
    return {
      type: "string_error",
      message: truncate(error, 500),
    };
  }

  if (typeof error === "number" || typeof error === "boolean") {
    return {
      type: typeof error,
      message: String(error),
    };
  }

  return {
    type: error === null ? "null" : typeof error,
    message: "Non-Error throwable",
  };
}

function normalizeContext(context: SafeServerErrorContext): Record<string, SafeServerErrorContextValue> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? truncate(value, 200) : value,
      ]),
  );
}

// Security-sensitive: keep server error logs structured and avoid dumping raw error objects or stacks.
export function logServerError(event: string, error: unknown, context: SafeServerErrorContext = {}): void {
  console.error(
    `[server-error] ${event}`,
    JSON.stringify({
      type: "server_error",
      event: truncate(event, 120),
      ...normalizeContext(context),
      error: normalizeServerError(error),
      at: new Date().toISOString(),
    }),
  );
}
