"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function AppModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: AppModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        className={cn(
          "relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-card/98 shadow-2xl",
          "supports-[backdrop-filter]:bg-card/90 supports-[backdrop-filter]:backdrop-blur-xl",
          className,
        )}
      >
        <div className="flex items-start justify-between border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="space-y-1">
            <h2 id="app-modal-title" className="text-xl font-semibold leading-7 text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mr-1"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="px-5 py-5 sm:px-6">{children}</div>
      </section>
    </div>
  );
}
