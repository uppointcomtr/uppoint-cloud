"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface VerificationCodeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function VerificationCodeInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  ariaLabel,
  className,
}: VerificationCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const normalizedValue = useMemo(() => value.replace(/\D/g, "").slice(0, 6), [value]);
  const activeIndex = normalizedValue.length >= 6 ? 5 : normalizedValue.length;

  useEffect(() => {
    if (normalizedValue !== value) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, onChange, value]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={6}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={normalizedValue}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />

      <div
        aria-hidden="true"
        className="grid grid-cols-6 gap-2 rounded-xl bg-background/50 px-1 py-1 dark:bg-input/10"
      >
        {Array.from({ length: 6 }).map((_, index) => {
          const digit = normalizedValue[index] ?? "";
          const isActive = isFocused && index === activeIndex;
          return (
            <div
              key={`${id}-slot-${index}`}
              className={cn(
                "flex h-14 items-center justify-center rounded-xl border-2 font-mono text-2xl font-semibold tabular-nums transition-all",
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : digit
                    ? "border-border bg-background"
                    : "border-border/50 bg-muted/40",
                digit ? "text-foreground" : "text-transparent",
              )}
            >
              {digit || "0"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
