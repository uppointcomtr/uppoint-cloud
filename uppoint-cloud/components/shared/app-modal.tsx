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
          "corp-surface relative z-10 w-full max-w-xl overflow-hidden bg-card/98 shadow-2xl",
          "supports-[backdrop-filter]:bg-card/90 supports-[backdrop-filter]:backdrop-blur-xl",
          className,
        )}
      >
        <div className="corp-surface-header flex items-start justify-between">
          <div className="space-y-1">
            <h2 id="app-modal-title" className="corp-heading-3">
              {title}
            </h2>
            {description ? (
              <p className="corp-body-muted">{description}</p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="-mr-1 shrink-0 border-border/70 bg-background/80 shadow-sm hover:bg-accent"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="corp-surface-body">{children}</div>
      </section>
    </div>
  );
}
