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
}

export function ThemeToggle({ labels }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  const buttonLabel = isDark ? labels.switchToLight : labels.switchToDark;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      aria-label={buttonLabel}
      title={buttonLabel}
      className="min-w-30"
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      <span suppressHydrationWarning>{buttonLabel}</span>
    </Button>
  );
}
