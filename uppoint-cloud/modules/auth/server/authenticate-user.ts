import "server-only";

import { prisma } from "@/db/client";
import { loginSchema } from "@/modules/auth/schemas/auth-schemas";

import { verifyPassword } from "./password";

interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
}

interface AuthenticateDependencies {
  findUserByEmail: (email: string) => Promise<UserRecord | null>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
}

const defaultDependencies: AuthenticateDependencies = {
  findUserByEmail: async (email) =>
    prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
      },
    }),
  verifyPassword,
};

export async function authenticateUser(
  credentials: unknown,
  dependencies: AuthenticateDependencies = defaultDependencies,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const parsedCredentials = loginSchema.safeParse(credentials);

  if (!parsedCredentials.success) {
    return null;
  }

  const user = await dependencies.findUserByEmail(parsedCredentials.data.email);
  if (!user) {
    return null;
  }

  const isPasswordValid = await dependencies.verifyPassword(
    parsedCredentials.data.password,
    user.passwordHash,
  );

  if (!isPasswordValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
