import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { resolveAuthRedirect, shouldPreserveCallbackUrl } from "@/modules/auth/server/route-access";
import { defaultLocale } from "@/modules/i18n/config";
import {
  extractLocaleFromPath,
  stripLocaleFromPath,
  withLocale,
} from "@/modules/i18n/paths";

const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

function getOrCreateRequestId(request: NextRequest): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
}

function buildForwardHeaders(request: NextRequest, requestId: string): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  return headers;
}

function withSecurityHeaders(response: NextResponse, requestId: string): NextResponse {
  response.headers.set("x-request-id", requestId);
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

function usesSecureSessionCookie(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  return request.nextUrl.protocol === "https:";
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestId = getOrCreateRequestId(request);
  const forwardHeaders = buildForwardHeaders(request, requestId);

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

  const redirectPath = resolveAuthRedirect(pathname, Boolean(token));

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
