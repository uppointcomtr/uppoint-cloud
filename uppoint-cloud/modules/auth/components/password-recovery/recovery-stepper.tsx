"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type RecoveryStep = "email" | "emailCode" | "smsCode" | "newPassword" | "success";

const STEP_ORDER: Exclude<RecoveryStep, "success">[] = [
  "email",
  "emailCode",
  "smsCode",
  "newPassword",
];

interface RecoveryStepperProps {
  step: RecoveryStep;
  labels: string[];
}

export function RecoveryStepper({ step, labels }: RecoveryStepperProps) {
  const currentIndex =
    step === "success"
      ? STEP_ORDER.length
      : STEP_ORDER.indexOf(step as Exclude<RecoveryStep, "success">);

  const progressPercent =
    currentIndex === 0
      ? 0
      : Math.min((currentIndex / (labels.length - 1)) * 100, 100);

  return (
    <div className="relative flex items-center justify-between pb-8">
      <div className="absolute inset-x-3.5 top-3.5 h-px bg-border/60">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {labels.map((label, i) => {
        const completed = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={i} className="relative flex flex-col items-center">
            <div
              className={cn(
                "relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                completed
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : active
                    ? "border-2 border-primary bg-background text-primary ring-4 ring-primary/15"
                    : "border border-border/70 bg-background text-muted-foreground",
              )}
            >
              {completed ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
            </div>
            <span
              className={cn(
                "absolute top-9 whitespace-nowrap text-[10px] font-medium leading-none",
                completed || active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function stripStepNumber(label: string): string {
  return label.replace(/^\d+\.\s*/, "");
}
