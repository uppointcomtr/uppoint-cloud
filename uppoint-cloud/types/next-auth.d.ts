import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string | null;
      name: string | null;
    } & Omit<DefaultSession["user"], "email" | "name">;
  }
}
