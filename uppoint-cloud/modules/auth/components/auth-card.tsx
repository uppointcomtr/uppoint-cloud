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
          : "bg-card/80 shadow-2xl backdrop-blur-md",
      )}
    >
      <CardHeader>
        {headerContent}
        <CardTitle className={titleClassName}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter>{footer}</CardFooter>
    </Card>
  );
}
