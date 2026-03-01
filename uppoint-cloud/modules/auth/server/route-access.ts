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
const PROTECTED_ROUTES: ProtectedRouteRule[] = [
  { prefix: "/dashboard", preserveCallbackUrl: true },
];
const AUTHENTICATED_HOME_PATH = "/dashboard";
const UNAUTHENTICATED_HOME_PATH = "/login";

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldPreserveCallbackUrl(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    ({ prefix, preserveCallbackUrl }) =>
      Boolean(preserveCallbackUrl)
      && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
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
