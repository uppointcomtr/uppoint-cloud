"use client";

import { Mail, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Dictionary } from "@/modules/i18n/dictionaries";

type LoginMode = "email" | "phone";

interface LoginModeTabsProps {
  mode: LoginMode;
  tabs: Dictionary["login"]["tabs"];
  onChangeMode: (mode: LoginMode) => void;
}

export function LoginModeTabs({ mode, tabs, onChangeMode }: LoginModeTabsProps) {
  return (
    <div className="relative grid grid-cols-2 rounded-xl border border-border/60 bg-muted/30 p-1">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-1 left-1 top-1 z-0 w-[calc(50%-0.25rem)] rounded-lg bg-background shadow-sm transition-transform duration-300",
          mode === "phone" ? "translate-x-full" : "translate-x-0",
        )}
      />
      <button
        type="button"
        className={cn(
          "relative z-10 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          mode === "email" ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onChangeMode("email")}
      >
        <Mail className="h-3.5 w-3.5" />
        {tabs.email}
      </button>
      <button
        type="button"
        className={cn(
          "relative z-10 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          mode === "phone" ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onChangeMode("phone")}
      >
        <Smartphone className="h-3.5 w-3.5" />
        {tabs.phone}
      </button>
    </div>
  );
}
