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
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const menuItemClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground";

export function ProfileMenu({ locale, dictionary, displayName, email }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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

  const dashboardPath = withLocale("/dashboard", locale);
  const securityPath = withLocale("/dashboard/security", locale);
  const notificationsPath = withLocale("/dashboard/notifications", locale);
  const tenantPath = withLocale("/dashboard/tenant", locale);
  const forgotPasswordPath = withLocale("/forgot-password", locale);
  const loginPath = withLocale("/login", locale);

  const initials = getInitials(displayName);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setIsOpen(false);
    await performLogout({ callbackUrl: loginPath });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((c) => !c)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/80 bg-background/90 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/80 dark:bg-background/70"
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
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border/70 bg-popover/95 shadow-xl backdrop-blur-sm"
        >
          {/* User info header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">{email}</p>
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
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {isLoggingOut ? dictionary.signOutLoading : dictionary.signOut}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
