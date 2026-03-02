import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  getRequestHost,
  hasConflictingForwardedHost,
  isAllowedHost,
  isAllowedOrigin,
  resolveAllowedHosts,
  resolveAllowedOrigins,
} from "@/lib/security/request-guards";
import { resolveAuthRedirect, shouldPreserveCallbackUrl } from "@/modules/auth/server/route-access";
import { defaultLocale } from "@/modules/i18n/config";
import {
  extractLocaleFromPath,
  stripLocaleFromPath,
  withLocale,
} from "@/modules/i18n/paths";

const PUBLIC_FILE_PATTERN = /\.[^/]+$/;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOWED_HOSTS = resolveAllowedHosts({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  configuredHosts: process.env.UPPOINT_ALLOWED_HOSTS,
});
const ALLOWED_ORIGINS = resolveAllowedOrigins({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  configuredOrigins: process.env.UPPOINT_ALLOWED_ORIGINS,
});
const INTERNAL_AUDIT_TOKEN = process.env.AUTH_SECRET;
const INTERNAL_AUDIT_URL = (() => {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return null;
  }

  try {
    return new URL("/api/internal/audit/security-event", process.env.NEXT_PUBLIC_APP_URL).toString();
  } catch {
    return null;
  }
})();
const INTERNAL_AUDIT_ORIGIN = (() => {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return null;
  }

  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
  } catch {
    return null;
  }
})();

if (IS_PRODUCTION && ALLOWED_HOSTS.size === 0) {
  throw new Error("Production host allowlist is empty; set NEXT_PUBLIC_APP_URL and/or UPPOINT_ALLOWED_HOSTS");
}

if (IS_PRODUCTION && ALLOWED_ORIGINS.size === 0) {
  throw new Error("Production origin allowlist is empty; set NEXT_PUBLIC_APP_URL and/or UPPOINT_ALLOWED_ORIGINS");
}

function getOrCreateRequestId(request: NextRequest): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
}

function buildForwardHeaders(request: NextRequest, requestId: string): Headers {
  const headers = new Headers(request.headers);
  const host = request.headers.get("host");
  headers.set("x-request-id", requestId);
  if (host) {
    // Security-sensitive: normalize forwarded host to authoritative Host header.
    headers.set("x-forwarded-host", host);
  }
  return headers;
}

function withSecurityHeaders(response: NextResponse, requestId: string): NextResponse {
  // In production Nginx is the canonical x-request-id producer/propagator.
  if (!IS_PRODUCTION) {
    response.headers.set("x-request-id", requestId);
  }
  return response;
}

function shouldBypassProxy(pathname: string): boolean {
  return (
    pathname.startsWith("/api")
    || pathname.startsWith("/_next")
    || pathname === "/favicon.ico"
    || PUBLIC_FILE_PATTERN.test(pathname)
  );
}

function isApiMutation(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function usesSecureSessionCookie(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  return request.nextUrl.protocol === "https:";
}

interface EdgeSecurityAuditEvent {
  action: "edge_host_rejected" | "edge_origin_rejected";
  requestId: string;
  path: string;
  method: string;
  host?: string | null;
  forwardedHost?: string | null;
  origin?: string | null;
  reason?: string;
}

function emitEdgeSecurityAudit(event: EdgeSecurityAuditEvent): void {
  if (!IS_PRODUCTION || !INTERNAL_AUDIT_URL || !INTERNAL_AUDIT_TOKEN || !INTERNAL_AUDIT_ORIGIN) {
    return;
  }

  void fetch(INTERNAL_AUDIT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: INTERNAL_AUDIT_ORIGIN,
      "x-internal-audit-token": INTERNAL_AUDIT_TOKEN,
    },
    body: JSON.stringify({
      action: event.action,
      requestId: event.requestId,
      path: event.path,
      method: event.method,
      host: event.host ?? undefined,
      forwardedHost: event.forwardedHost ?? undefined,
      origin: event.origin ?? undefined,
      reason: event.reason,
    }),
  }).catch(() => {
    // Security telemetry must never block user-facing responses.
  });
}

interface SessionTokenLike {
  sub?: unknown;
  sessionJti?: unknown;
  tokenVersion?: unknown;
  revoked?: unknown;
}

function isValidEdgeSessionToken(token: SessionTokenLike | null): boolean {
  if (!token) {
    return false;
  }

  if (token.revoked === true) {
    return false;
  }

  if (typeof token.sub !== "string" || token.sub.trim().length === 0) {
    return false;
  }

  if (typeof token.sessionJti !== "string" || token.sessionJti.trim().length < 16) {
    return false;
  }

  if (typeof token.tokenVersion !== "number" || !Number.isInteger(token.tokenVersion) || token.tokenVersion < 0) {
    return false;
  }

  return true;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestId = getOrCreateRequestId(request);
  const forwardHeaders = buildForwardHeaders(request, requestId);
  const requestHost = getRequestHost(request);

  if (IS_PRODUCTION && hasConflictingForwardedHost(request)) {
    emitEdgeSecurityAudit({
      action: "edge_host_rejected",
      requestId,
      path: pathname,
      method: request.method,
      host: requestHost,
      forwardedHost: request.headers.get("x-forwarded-host"),
      reason: "HOST_FORWARD_CONFLICT",
    });
    return withSecurityHeaders(
      NextResponse.json(
        { success: false, error: "INVALID_HOST_HEADER" },
        { status: 400 },
      ),
      requestId,
    );
  }

  if (IS_PRODUCTION && !isAllowedHost(requestHost, ALLOWED_HOSTS)) {
    emitEdgeSecurityAudit({
      action: "edge_host_rejected",
      requestId,
      path: pathname,
      method: request.method,
      host: requestHost,
      forwardedHost: request.headers.get("x-forwarded-host"),
      reason: "HOST_NOT_ALLOWLISTED",
    });
    return withSecurityHeaders(
      NextResponse.json(
        { success: false, error: "INVALID_HOST_HEADER" },
        { status: 400 },
      ),
      requestId,
    );
  }

  if (IS_PRODUCTION && isApiMutation(pathname, request.method)) {
    const origin = request.headers.get("origin");

    if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
      emitEdgeSecurityAudit({
        action: "edge_origin_rejected",
        requestId,
        path: pathname,
        method: request.method,
        host: requestHost,
        origin,
        reason: "ORIGIN_NOT_ALLOWLISTED",
      });
      return withSecurityHeaders(
        NextResponse.json(
          { success: false, error: "ORIGIN_NOT_ALLOWED" },
          { status: 403 },
        ),
        requestId,
      );
    }
  }

  if (shouldBypassProxy(pathname)) {
    return withSecurityHeaders(
      NextResponse.next({
        request: {
          headers: forwardHeaders,
        },
      }),
      requestId,
    );
  }

  const locale = extractLocaleFromPath(pathname);

  if (!locale) {
    const destination = request.nextUrl.clone();
    destination.pathname = withLocale(pathname === "/" ? "/login" : pathname, defaultLocale);
    return withSecurityHeaders(NextResponse.redirect(destination), requestId);
  }

  const useSecureCookie = usesSecureSessionCookie(request);

  // Security-sensitive: align middleware token lookup with the secure cookie name set over HTTPS.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: useSecureCookie,
    cookieName: useSecureCookie
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
  });

  const redirectPath = resolveAuthRedirect(pathname, isValidEdgeSessionToken(token as SessionTokenLike | null));

  if (!redirectPath) {
    return withSecurityHeaders(
      NextResponse.next({
        request: {
          headers: forwardHeaders,
        },
      }),
      requestId,
    );
  }

  const destination = request.nextUrl.clone();
  destination.pathname = redirectPath;

  if (!token && shouldPreserveCallbackUrl(stripLocaleFromPath(pathname))) {
    destination.searchParams.set("callbackUrl", pathname);
  }

  return withSecurityHeaders(NextResponse.redirect(destination), requestId);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
