import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tokenVersion?: number;
    rememberMe?: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string | null;
      name: string | null;
      tokenVersion: number;
      rememberMe?: boolean;
    } & Omit<DefaultSession["user"], "email" | "name">;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tokenVersion?: number;
    revoked?: boolean;
    sessionJti?: string;
    validatedAt?: number;
    rememberMe?: boolean;
    idleTimeoutSeconds?: number;
    lastActivityAt?: number;
    idleExpiresAt?: number;
  }
}
