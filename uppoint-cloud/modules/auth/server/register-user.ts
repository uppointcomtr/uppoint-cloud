import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { registerSchema } from "@/modules/auth/schemas/auth-schemas";

import { hashPassword } from "./password";

export class RegisterUserError extends Error {
  constructor(
    public readonly code: "EMAIL_TAKEN" | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "RegisterUserError";
  }
}

export interface RegisterUserDependencies {
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  createUser: (input: {
    email: string;
    name: string;
    phone?: string;
    passwordHash: string;
  }) => Promise<{
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  }>;
  hashPassword: (password: string) => Promise<string>;
}

const defaultDependencies: RegisterUserDependencies = {
  findUserByEmail: async (email) =>
    prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    }),
  createUser: async (input) =>
    prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash: input.passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
      },
    }),
  // Security-sensitive: password hashing work factor is centrally controlled via env validation.
  hashPassword: async (password) => hashPassword(password, env.AUTH_BCRYPT_ROUNDS),
};

function normalizePhone(phone: string): string | undefined {
  if (phone === "") {
    return undefined;
  }

  return phone.startsWith("+") ? phone : `+${phone}`;
}

export async function registerUser(
  rawInput: unknown,
  dependencies: RegisterUserDependencies = defaultDependencies,
): Promise<{ id: string; email: string; name: string | null; phone: string | null }> {
  const parsedInput = registerSchema.parse(rawInput);

  const existingUser = await dependencies.findUserByEmail(parsedInput.email);
  if (existingUser) {
    throw new RegisterUserError("EMAIL_TAKEN", "An account with this email already exists");
  }

  const passwordHash = await dependencies.hashPassword(parsedInput.password);

  try {
    return await dependencies.createUser({
      email: parsedInput.email,
      name: parsedInput.name,
      phone: normalizePhone(parsedInput.phone),
      passwordHash,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new RegisterUserError("EMAIL_TAKEN", "An account with this email already exists");
    }

    if (error instanceof z.ZodError) {
      throw error;
    }

    throw new RegisterUserError("UNKNOWN", "Unable to register user");
  }
}
