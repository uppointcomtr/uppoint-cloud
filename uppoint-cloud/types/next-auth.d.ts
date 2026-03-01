import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tokenVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      email: string | null;
      name: string | null;
      tokenVersion: number;
    } & Omit<DefaultSession["user"], "email" | "name">;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tokenVersion?: number;
    revoked?: boolean;
  }
}
