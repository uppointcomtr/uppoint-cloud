import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";
import { generateSessionJti, isSessionJtiRevoked } from "@/lib/session-revocation";
import { consumeLoginToken } from "@/modules/auth/server/login-challenge";
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
      name: "Uppoint Cloud Login Token",
      credentials: {
        loginToken: {
          label: "Login Token",
          type: "text",
        },
      },
      authorize: async (credentials) => consumeLoginToken(credentials),
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.tokenVersion = typeof user.tokenVersion === "number" ? user.tokenVersion : 0;
        token.sessionJti = typeof token.sessionJti === "string" ? token.sessionJti : generateSessionJti();
        token.revoked = false;
        return token;
      }

      if (!token.sub) {
        return token;
      }

      const revokedByJti = await isSessionJtiRevoked(
        typeof token.sessionJti === "string" ? token.sessionJti : undefined,
      );

      if (revokedByJti) {
        token.sub = "";
        token.email = undefined;
        token.name = undefined;
        token.tokenVersion = undefined;
        token.revoked = true;
        return token;
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          tokenVersion: true,
          email: true,
          name: true,
        },
      });

      const tokenVersion = typeof token.tokenVersion === "number" ? token.tokenVersion : 0;

      if (!currentUser || currentUser.tokenVersion !== tokenVersion) {
        token.sub = "";
        token.email = undefined;
        token.name = undefined;
        token.tokenVersion = undefined;
        token.revoked = true;
        return token;
      }

      token.email = currentUser.email ?? token.email;
      token.name = currentUser.name ?? token.name;
      token.revoked = false;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        const revoked = token.revoked || !token.sub;
        session.user.id = revoked ? "" : (token.sub ?? "");
        session.user.email = revoked ? null : (token.email ?? null);
        session.user.name = revoked ? null : (token.name ?? null);
        session.user.tokenVersion = typeof token.tokenVersion === "number" ? token.tokenVersion : 0;
      }

      return session;
    },
  },
};

export async function auth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return session;
}
