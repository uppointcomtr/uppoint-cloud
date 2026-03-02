"use client";

import type { ReactNode } from "react";

interface IdentityChipProps {
  label: string;
  value: string;
  icon: ReactNode;
}

export function IdentityChip({ label, value, icon }: IdentityChipProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
