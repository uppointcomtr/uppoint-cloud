import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { resolveAuthRedirect } from "@/modules/auth/server/route-access";
import { defaultLocale } from "@/modules/i18n/config";
import { extractLocaleFromPath, stripLocaleFromPath, withLocale } from "@/modules/i18n/paths";

const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

function shouldBypassProxy(pathname: string): boolean {
  return (
    pathname.startsWith("/api")
    || pathname.startsWith("/_next")
    || pathname === "/favicon.ico"
    || PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (shouldBypassProxy(pathname)) {
    return NextResponse.next();
  }

  const locale = extractLocaleFromPath(pathname);

  if (!locale) {
    const destination = request.nextUrl.clone();
    destination.pathname = withLocale(pathname, defaultLocale);
    return NextResponse.redirect(destination);
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  const redirectPath = resolveAuthRedirect(pathname, Boolean(token));

  if (!redirectPath) {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.pathname = redirectPath;

  if (!token && stripLocaleFromPath(pathname).startsWith("/dashboard")) {
    destination.searchParams.set("callbackUrl", pathname);
  }

  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
