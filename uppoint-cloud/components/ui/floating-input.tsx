"use client";

import { forwardRef, useId, useState } from "react";

import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  function FloatingInput({ label, onFocus, onBlur, className, id, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          placeholder=" "
          data-slot="input"
          className={cn(
            "peer h-12 w-full min-w-0 rounded-md border border-input bg-transparent px-3 pb-2 pt-5 text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
            className,
          )}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute left-3 select-none text-muted-foreground transition-all duration-150",
            "top-0 -translate-y-1/2 bg-background px-1 text-xs leading-none",
            !focused &&
              "peer-placeholder-shown:top-1/2 peer-placeholder-shown:bg-transparent peer-placeholder-shown:px-0 peer-placeholder-shown:text-sm peer-placeholder-shown:leading-normal peer-placeholder-shown:-translate-y-1/2",
          )}
        >
          {label}
        </label>
      </div>
    );
  },
);
