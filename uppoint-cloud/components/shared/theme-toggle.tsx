"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/modules/theme/theme-provider";

interface ThemeToggleLabels {
  switchToDark: string;
  switchToLight: string;
}

interface ThemeToggleProps {
  labels: ThemeToggleLabels;
  iconOnly?: boolean;
}

export function ThemeToggle({ labels, iconOnly = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  const buttonLabel = isDark ? labels.switchToLight : labels.switchToDark;

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      onClick={toggleTheme}
      aria-label={buttonLabel}
      title={buttonLabel}
      className={iconOnly ? undefined : "min-w-30"}
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      {!iconOnly && <span suppressHydrationWarning>{buttonLabel}</span>}
    </Button>
  );
}
