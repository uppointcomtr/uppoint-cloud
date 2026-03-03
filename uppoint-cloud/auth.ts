import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/db/client";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { generateSessionJti, isSessionJtiRevoked } from "@/lib/session-revocation";
import { consumeLoginToken } from "@/modules/auth/server/login-challenge";
import { defaultLocale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

const SESSION_REVALIDATE_WINDOW_MS = env.AUTH_SESSION_REVALIDATE_SECONDS * 1000;
// Security-sensitive: production disables JWT revalidation cache so tokenVersion bumps invalidate sessions immediately.
const SESSION_REVALIDATION_CACHE_ENABLED = env.NODE_ENV !== "production";

function pickAuthHeader(
  headersInput: unknown,
  name: string,
): string | null {
  if (!headersInput || typeof headersInput !== "object") {
    return null;
  }

  if (headersInput instanceof Headers) {
    const value = headersInput.get(name);
    return value && value.trim().length > 0 ? value.trim() : null;
  }

  const record = headersInput as Record<string, string | string[] | undefined>;
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (Array.isArray(value)) {
    const joined = value.join(",").trim();
    return joined.length > 0 ? joined : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

function resolveAuthorizeAuditIp(requestInput: unknown): string {
  const requestRecord = requestInput as { headers?: unknown } | undefined;
  const realIpHeader = pickAuthHeader(requestRecord?.headers, "x-real-ip");
  const forwardedForHeader = pickAuthHeader(requestRecord?.headers, "x-forwarded-for");

  const trustedIp = resolveTrustedClientIp({
    realIpHeader,
    forwardedForHeader,
    isProduction: env.NODE_ENV === "production",
  });

  return trustedIp ?? "unknown";
}

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
      authorize: async (credentials, request) => {
        const user = await consumeLoginToken(credentials);

        if (user) {
          await logAudit("login_success", resolveAuthorizeAuditIp(request), user.id, {
            mode: "credentials",
            result: "SUCCESS",
          });
        }

        return user;
      },
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
        token.validatedAt = Date.now();
        return token;
      }

      if (!token.sub) {
        return token;
      }

      const nowMs = Date.now();
      const revokedByJti = await isSessionJtiRevoked(
        typeof token.sessionJti === "string" ? token.sessionJti : undefined,
      );

      if (revokedByJti) {
        token.sub = "";
        token.email = undefined;
        token.name = undefined;
        token.tokenVersion = undefined;
        token.revoked = true;
        token.validatedAt = nowMs;
        return token;
      }

      const tokenValidatedAt = typeof token.validatedAt === "number" ? token.validatedAt : 0;
      if (
        SESSION_REVALIDATION_CACHE_ENABLED
        && token.revoked !== true
        && tokenValidatedAt > 0
        && nowMs - tokenValidatedAt < SESSION_REVALIDATE_WINDOW_MS
      ) {
        return token;
      }

      const currentUser = await prisma.user.findFirst({
        where: { id: token.sub, deletedAt: null },
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
        token.validatedAt = nowMs;
        return token;
      }

      token.email = currentUser.email ?? token.email;
      token.name = currentUser.name ?? token.name;
      token.revoked = false;
      token.validatedAt = nowMs;
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
