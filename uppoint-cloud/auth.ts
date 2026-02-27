import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";
import { authenticateUser } from "@/modules/auth/server/authenticate-user";
import { defaultLocale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    // Security-sensitive: JWT sessions work with middleware protection at the edge layer.
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  secret: env.AUTH_SECRET,
  pages: {
    signIn: withLocale("/login", defaultLocale),
  },
  providers: [
    CredentialsProvider({
      name: "E-posta ve Sifre",
      credentials: {
        email: {
          label: "E-posta",
          type: "email",
        },
        password: {
          label: "Sifre",
          type: "password",
        },
      },
      authorize: async (credentials) => authenticateUser(credentials),
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? null;
        session.user.name = token.name ?? null;
      }

      return session;
    },
  },
};

export async function auth() {
  return getServerSession(authOptions);
}
