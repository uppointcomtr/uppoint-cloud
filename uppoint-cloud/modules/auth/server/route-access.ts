import { defaultLocale } from "@/modules/i18n/config";
import {
  extractLocaleFromPath,
  stripLocaleFromPath,
  withLocale,
} from "@/modules/i18n/paths";

interface ProtectedRouteRule {
  path: string;
  preserveCallbackUrl?: boolean;
}

export const AUTH_ROUTES = new Set(["/login", "/register"]);
export const EXPLICIT_PUBLIC_ROUTES = new Set([
  "/",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);
export const PROTECTED_ROUTES: ProtectedRouteRule[] = [
  { path: "/dashboard", preserveCallbackUrl: true },
  { path: "/dashboard/account", preserveCallbackUrl: true },
  { path: "/dashboard/security", preserveCallbackUrl: true },
  { path: "/dashboard/notifications", preserveCallbackUrl: true },
  { path: "/dashboard/tenant", preserveCallbackUrl: true },
  { path: "/dashboard/modules", preserveCallbackUrl: true },
];
const AUTHENTICATED_HOME_PATH = "/dashboard";
const UNAUTHENTICATED_HOME_PATH = "/login";

function isExplicitlyPublicRoute(pathname: string): boolean {
  return EXPLICIT_PUBLIC_ROUTES.has(pathname);
}

export function hasExplicitProtectedRouteRule(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    ({ path }) => pathname === path,
  );
}

export function isProtectedRoute(pathname: string): boolean {
  if (AUTH_ROUTES.has(pathname) || isExplicitlyPublicRoute(pathname)) {
    return false;
  }

  return hasExplicitProtectedRouteRule(pathname);
}

export function shouldPreserveCallbackUrl(pathname: string): boolean {
  if (!isProtectedRoute(pathname)) {
    return false;
  }

  return PROTECTED_ROUTES.some(
    ({ path, preserveCallbackUrl }) =>
      Boolean(preserveCallbackUrl)
      && pathname === path,
  );
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
