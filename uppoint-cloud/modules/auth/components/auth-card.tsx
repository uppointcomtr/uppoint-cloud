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
    <Card className="w-full max-w-md">
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
