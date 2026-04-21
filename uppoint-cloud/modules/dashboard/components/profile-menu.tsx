"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Building2,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";

import { performLogout } from "@/modules/auth/client/logout";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

interface ProfileMenuProps {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["profileMenu"];
  displayName: string;
  email: string;
  activeTenantId?: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const menuItemClass =
  "corp-menu-item";

function appendTenantQuery(path: string, tenantId: string | null | undefined): string {
  if (!tenantId) {
    return path;
  }

  return `${path}?tenantId=${encodeURIComponent(tenantId)}`;
}

export function ProfileMenu({ locale, dictionary, displayName, email, activeTenantId }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const dashboardPath = appendTenantQuery(withLocale("/dashboard/account", locale), activeTenantId);
  const securityPath = appendTenantQuery(withLocale("/dashboard/security", locale), activeTenantId);
  const notificationsPath = appendTenantQuery(withLocale("/dashboard/notifications", locale), activeTenantId);
  const tenantPath = appendTenantQuery(withLocale("/dashboard/tenant", locale), activeTenantId);
  const forgotPasswordPath = withLocale("/forgot-password", locale);
  const loginPath = withLocale("/login", locale);

  const initials = getInitials(displayName);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await performLogout({ callbackUrl: loginPath });
    } catch {
      setLogoutError(dictionary.signOutFailed);
      setIsLoggingOut(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((c) => !c)}
        className="corp-toolbar-btn corp-btn-icon inline-flex items-center justify-center border border-border/80 text-xs font-semibold text-foreground hover:shadow"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={dictionary.buttonLabel}
        title={dictionary.buttonLabel}
      >
        {initials}
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={dictionary.menuLabel}
          className="corp-menu-surface corp-motion-surface absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border/70 bg-popover/95 shadow-xl backdrop-blur-sm"
        >
          {/* User info header */}
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="corp-title-base truncate leading-tight">{displayName}</p>
              <p className="corp-field-hint mt-0.5 truncate leading-tight">{email}</p>
            </div>
          </div>

          {/* Navigation links */}
          <div className="p-1.5">
            <Link href={dashboardPath} role="menuitem" onClick={() => setIsOpen(false)} className={menuItemClass}>
              <UserCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              {dictionary.accountOverview}
            </Link>
            <Link href={securityPath} role="menuitem" onClick={() => setIsOpen(false)} className={menuItemClass}>
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              {dictionary.securityCenter}
            </Link>
            <Link href={notificationsPath} role="menuitem" onClick={() => setIsOpen(false)} className={menuItemClass}>
              <BellRing className="h-4 w-4 shrink-0 text-muted-foreground" />
              {dictionary.notificationCenter}
            </Link>
          </div>

          <div className="border-t border-border/60 p-1.5">
            <Link href={tenantPath} role="menuitem" onClick={() => setIsOpen(false)} className={menuItemClass}>
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              {dictionary.tenantContext}
            </Link>
            <Link href={forgotPasswordPath} role="menuitem" onClick={() => setIsOpen(false)} className={menuItemClass}>
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              {dictionary.resetPassword}
            </Link>
          </div>

          {/* Logout */}
          <div className="border-t border-border/60 p-1.5">
            <button
              type="button"
              role="menuitem"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              className="corp-menu-item-danger"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {isLoggingOut ? dictionary.signOutLoading : dictionary.signOut}
            </button>
            {logoutError ? (
              <p role="alert" className="px-3 pt-2 text-xs text-destructive">
                {logoutError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
