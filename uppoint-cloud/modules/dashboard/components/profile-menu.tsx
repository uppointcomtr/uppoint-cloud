"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Building2,
  ChevronDown,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function ProfileMenu({ locale, dictionary, displayName, email }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
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
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-w-[208px] items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-left shadow-sm transition-colors hover:bg-accent/50"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={dictionary.buttonLabel}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserCircle2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-muted-foreground">{dictionary.statusLabel}</span>
          <span className="block truncate text-sm font-medium">{displayName}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={dictionary.menuLabel}
          className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border/60 bg-card p-2 shadow-lg"
        >
          <div className="mb-2 rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>

          <div className="space-y-1">
            <Link
              href={dashboardPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              {dictionary.accountOverview}
            </Link>
            <Link
              href={securityPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              {dictionary.securityCenter}
            </Link>
            <Link
              href={notificationsPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <BellRing className="h-4 w-4 text-muted-foreground" />
              {dictionary.notificationCenter}
            </Link>
            <Link
              href={tenantPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {dictionary.tenantContext}
            </Link>
            <Link
              href={forgotPasswordPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              {dictionary.resetPassword}
            </Link>
          </div>

          <div className="mt-2 border-t border-border/60 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-4 w-4" />
              {isLoggingOut ? dictionary.signOutLoading : dictionary.signOut}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
