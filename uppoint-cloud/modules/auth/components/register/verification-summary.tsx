"use client";

import type { ReactNode } from "react";
import { Clock } from "lucide-react";

interface VerificationSummaryProps {
  icon: ReactNode;
  text: string;
  countdownSeconds: number | null;
  countdownPrefix: string;
  formatCountdown: (seconds: number) => string;
}

export function VerificationSummary({
  icon,
  text,
  countdownSeconds,
  countdownPrefix,
  formatCountdown,
}: VerificationSummaryProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{text}</span>
      </div>
      {countdownSeconds !== null ? (
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <Clock className="h-3.5 w-3.5" />
          <span>{countdownPrefix} {formatCountdown(countdownSeconds)}</span>
        </div>
      ) : null}
    </div>
  );
}
