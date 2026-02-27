import { defaultLocale } from "@/modules/i18n/config";
import {
  extractLocaleFromPath,
  stripLocaleFromPath,
  withLocale,
} from "@/modules/i18n/paths";

const AUTH_ROUTES = new Set(["/login", "/register"]);
const PROTECTED_PREFIXES = ["/dashboard"];

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function resolveAuthRedirect(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  const locale = extractLocaleFromPath(pathname) ?? defaultLocale;
  const normalizedPathname = stripLocaleFromPath(pathname);

  if (isProtectedRoute(normalizedPathname) && !isAuthenticated) {
    return withLocale("/login", locale);
  }

  if (AUTH_ROUTES.has(normalizedPathname) && isAuthenticated) {
    return withLocale("/dashboard", locale);
  }

  return null;
}
