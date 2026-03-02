import { defaultLocale } from "@/modules/i18n/config";
import {
  extractLocaleFromPath,
  stripLocaleFromPath,
  withLocale,
} from "@/modules/i18n/paths";

interface ProtectedRouteRule {
  prefix: string;
  preserveCallbackUrl?: boolean;
}

const AUTH_ROUTES = new Set(["/login", "/register"]);
const EXPLICIT_PUBLIC_ROUTES = new Set([
  "/",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);
const PROTECTED_ROUTES: ProtectedRouteRule[] = [
  { prefix: "/dashboard", preserveCallbackUrl: true },
];
const AUTHENTICATED_HOME_PATH = "/dashboard";
const UNAUTHENTICATED_HOME_PATH = "/login";

function isExplicitlyPublicRoute(pathname: string): boolean {
  return EXPLICIT_PUBLIC_ROUTES.has(pathname);
}

export function isProtectedRoute(pathname: string): boolean {
  if (AUTH_ROUTES.has(pathname) || isExplicitlyPublicRoute(pathname)) {
    return false;
  }

  return PROTECTED_ROUTES.some(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  ) || pathname.startsWith("/");
}

export function shouldPreserveCallbackUrl(pathname: string): boolean {
  if (!isProtectedRoute(pathname)) {
    return false;
  }

  return PROTECTED_ROUTES.some(
    ({ prefix, preserveCallbackUrl }) =>
      Boolean(preserveCallbackUrl)
      && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  ) || pathname !== "/";
}

export function resolveAuthRedirect(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  const locale = extractLocaleFromPath(pathname) ?? defaultLocale;
  const normalizedPathname = stripLocaleFromPath(pathname);

  if (isProtectedRoute(normalizedPathname) && !isAuthenticated) {
    return withLocale(UNAUTHENTICATED_HOME_PATH, locale);
  }

  if (AUTH_ROUTES.has(normalizedPathname) && isAuthenticated) {
    return withLocale(AUTHENTICATED_HOME_PATH, locale);
  }

  return null;
}
