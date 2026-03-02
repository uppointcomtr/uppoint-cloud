"use client";

import { Check, X } from "lucide-react";

interface PasswordRule {
  met: boolean;
  label: string;
}

interface PasswordRulesListProps {
  rules: PasswordRule[];
}

export function PasswordRulesList({ rules }: PasswordRulesListProps) {
  return (
    <ul className="mt-1.5 grid grid-cols-1 gap-y-1">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-1.5 text-xs transition-colors ${rule.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
        >
          {rule.met
            ? <Check className="h-3 w-3 shrink-0" />
            : <X className="h-3 w-3 shrink-0" />}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
