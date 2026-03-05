"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/modules/theme/theme-provider";

interface ThemeToggleLabels {
  switchToDark: string;
  switchToLight: string;
}

interface ThemeToggleProps {
  labels: ThemeToggleLabels;
  iconOnly?: boolean;
  className?: string;
}

export function ThemeToggle({ labels, iconOnly = false, className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  const buttonLabel = isDark ? labels.switchToLight : labels.switchToDark;

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      onClick={toggleTheme}
      aria-label={buttonLabel}
      title={buttonLabel}
      className={cn(iconOnly ? "size-8" : "min-w-30", className)}
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      {!iconOnly && <span suppressHydrationWarning>{buttonLabel}</span>}
    </Button>
  );
}
