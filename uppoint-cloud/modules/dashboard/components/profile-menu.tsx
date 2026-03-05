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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background/80 shadow-sm transition-colors hover:bg-accent/50"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={dictionary.buttonLabel}
        title={dictionary.buttonLabel}
      >
        <UserCircle2 className="h-4 w-4 text-primary" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={dictionary.menuLabel}
          className="absolute right-0 z-50 mt-2 w-[22rem] rounded-2xl border border-border/70 bg-card/95 p-3 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.75)] backdrop-blur"
        >
          <div className="mb-3 rounded-xl border border-border/60 bg-background/80 p-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UserCircle2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Link
              href={dashboardPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:border-border/70 hover:bg-accent/60"
            >
              <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              {dictionary.accountOverview}
            </Link>
            <Link
              href={securityPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:border-border/70 hover:bg-accent/60"
            >
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              {dictionary.securityCenter}
            </Link>
            <Link
              href={notificationsPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:border-border/70 hover:bg-accent/60"
            >
              <BellRing className="h-4 w-4 text-muted-foreground" />
              {dictionary.notificationCenter}
            </Link>
            <Link
              href={tenantPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:border-border/70 hover:bg-accent/60"
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {dictionary.tenantContext}
            </Link>
            <Link
              href={forgotPasswordPath}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:border-border/70 hover:bg-accent/60"
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              {dictionary.resetPassword}
            </Link>
          </div>

          <div className="mt-3 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start border-border/70 bg-background/85"
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
