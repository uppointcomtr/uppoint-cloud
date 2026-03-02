"use client";

import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoginStepIndicatorProps {
  currentStepIndex: number;
  activeStepLabel: string;
  isOtpStep: boolean;
  countdownSeconds: number | null;
  formatCountdown: (seconds: number) => string;
}

export function LoginStepIndicator({
  currentStepIndex,
  activeStepLabel,
  isOtpStep,
  countdownSeconds,
  formatCountdown,
}: LoginStepIndicatorProps) {
  const isCodeExpired = countdownSeconds !== null && countdownSeconds <= 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {currentStepIndex + 1}
      </div>
      <span className="flex-1 text-sm font-semibold text-foreground">{activeStepLabel}</span>
      {isOtpStep && countdownSeconds !== null ? (
        <p className={cn(
          "flex items-center gap-1 text-xs",
          isCodeExpired ? "font-medium text-destructive" : "text-muted-foreground",
        )}>
          <Clock className="h-3 w-3 shrink-0" />
          {formatCountdown(countdownSeconds)}
        </p>
      ) : (
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === currentStepIndex ? "w-4 bg-primary" :
                i < currentStepIndex  ? "w-1.5 bg-primary/50" :
                                        "w-1.5 bg-muted-foreground/20",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
