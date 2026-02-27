import { defaultLocale, isLocale, type Locale } from "./config";

function normalizePathname(pathname: string): string {
  if (!pathname.startsWith("/")) {
    return `/${pathname}`;
  }

  return pathname;
}

function toPathname(segments: string[]): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

export function extractLocaleFromPath(pathname: string): Locale | null {
  const normalized = normalizePathname(pathname);
  const [firstSegment] = normalized.split("/").filter(Boolean);

  if (!firstSegment || !isLocale(firstSegment)) {
    return null;
  }

  return firstSegment;
}

export function stripLocaleFromPath(pathname: string): string {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  if (isLocale(segments[0])) {
    return toPathname(segments.slice(1));
  }

  return toPathname(segments);
}

export function withLocale(pathname: string, locale: Locale = defaultLocale): string {
  const normalizedPathname = stripLocaleFromPath(pathname);

  if (normalizedPathname === "/") {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPathname}`;
}
