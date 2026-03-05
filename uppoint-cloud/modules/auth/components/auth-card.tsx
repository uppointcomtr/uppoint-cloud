import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
  headerContent?: ReactNode;
  titleClassName?: string;
  surface?: "card" | "plain";
}

export function AuthCard({
  title,
  description,
  footer,
  children,
  headerContent,
  titleClassName,
  surface = "card",
}: AuthCardProps) {
  return (
    <Card
      className={cn(
        "w-full max-w-md",
        surface === "plain"
          ? "border-0 bg-transparent shadow-none"
          : "border-border/70 bg-card/92 shadow-[0_30px_70px_-46px_rgba(15,23,42,0.7)] backdrop-blur-xl",
      )}
    >
      <CardHeader className="space-y-2">
        {headerContent}
        <CardTitle className={cn("text-2xl leading-8", titleClassName)}>{title}</CardTitle>
        <CardDescription className="text-sm leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter>{footer}</CardFooter>
    </Card>
  );
}
