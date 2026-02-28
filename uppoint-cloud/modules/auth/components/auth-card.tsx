import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
  headerContent?: ReactNode;
}

export function AuthCard({ title, description, footer, children, headerContent }: AuthCardProps) {
  return (
    <Card className="w-full max-w-md bg-card/80 shadow-2xl backdrop-blur-md">
      <CardHeader>
        {headerContent}
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter>{footer}</CardFooter>
    </Card>
  );
}
