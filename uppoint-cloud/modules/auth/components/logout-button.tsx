"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface LogoutButtonProps {
  locale: Locale;
  label: string;
}

export function LogoutButton({ locale, label }: LogoutButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void signOut({ callbackUrl: withLocale("/login", locale) })}
    >
      {label}
    </Button>
  );
}
