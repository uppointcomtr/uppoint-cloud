import "server-only";

import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env/server";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: env.DATABASE_URL },
    },
    // production: minimal format avoids leaking internal SQL details in logs
    errorFormat: env.NODE_ENV === "production" ? "minimal" : "pretty",
    log: env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
