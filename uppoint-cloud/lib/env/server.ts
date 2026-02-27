import "server-only";

import { z } from "zod";

const booleanFromString = z.preprocess((value) => {
  if (typeof value === "string") {
    return value === "true";
  }

  return value;
}, z.boolean());

const emailBackendSchema = z.enum(["smtp", "disabled"]);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_TRUST_HOST: booleanFromString.default(false),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  UPPOINT_DEFAULT_FROM_EMAIL: z.string().min(3).optional(),
  UPPOINT_EMAIL_BACKEND: emailBackendSchema.default("disabled"),
  UPPOINT_EMAIL_HOST: z.string().min(1).optional(),
  UPPOINT_EMAIL_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  UPPOINT_EMAIL_HOST_USER: z.string().min(1).optional(),
  UPPOINT_EMAIL_HOST_PASSWORD: z.string().min(1).optional(),
  UPPOINT_EMAIL_USE_TLS: booleanFromString.default(true),
  UPPOINT_SMS_ENABLED: booleanFromString.default(false),
  UPPOINT_SMS_API_URL: z.string().url().optional(),
  UPPOINT_SMS_USERNAME: z.string().min(1).optional(),
  UPPOINT_SMS_PASSWORD: z.string().min(1).optional(),
  UPPOINT_SMS_SOURCE_ADDR: z.string().trim().min(1).max(16).optional(),
  UPPOINT_SMS_VALID_FOR: z.string().regex(/^\d{1,2}:\d{2}$/).default("48:00"),
  UPPOINT_SMS_DATACODING: z.coerce.number().int().min(0).max(2).default(2),
}).superRefine((input, context) => {
  if (input.UPPOINT_EMAIL_BACKEND === "smtp") {
    const requiredSmtpFields = [
      "UPPOINT_DEFAULT_FROM_EMAIL",
      "UPPOINT_EMAIL_HOST",
      "UPPOINT_EMAIL_PORT",
      "UPPOINT_EMAIL_HOST_USER",
      "UPPOINT_EMAIL_HOST_PASSWORD",
    ] as const;

    for (const field of requiredSmtpFields) {
      if (!input[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when UPPOINT_EMAIL_BACKEND=smtp`,
        });
      }
    }
  }

  if (input.UPPOINT_SMS_ENABLED) {
    const requiredSmsFields = [
      "UPPOINT_SMS_API_URL",
      "UPPOINT_SMS_USERNAME",
      "UPPOINT_SMS_PASSWORD",
      "UPPOINT_SMS_SOURCE_ADDR",
    ] as const;

    for (const field of requiredSmsFields) {
      if (!input[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when UPPOINT_SMS_ENABLED=true`,
        });
      }
    }
  }
});

const parsedEnv = serverEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  AUTH_BCRYPT_ROUNDS: process.env.AUTH_BCRYPT_ROUNDS,
  UPPOINT_DEFAULT_FROM_EMAIL: process.env.UPPOINT_DEFAULT_FROM_EMAIL,
  UPPOINT_EMAIL_BACKEND: process.env.UPPOINT_EMAIL_BACKEND,
  UPPOINT_EMAIL_HOST: process.env.UPPOINT_EMAIL_HOST,
  UPPOINT_EMAIL_PORT: process.env.UPPOINT_EMAIL_PORT,
  UPPOINT_EMAIL_HOST_USER: process.env.UPPOINT_EMAIL_HOST_USER,
  UPPOINT_EMAIL_HOST_PASSWORD: process.env.UPPOINT_EMAIL_HOST_PASSWORD,
  UPPOINT_EMAIL_USE_TLS: process.env.UPPOINT_EMAIL_USE_TLS,
  UPPOINT_SMS_ENABLED: process.env.UPPOINT_SMS_ENABLED,
  UPPOINT_SMS_API_URL: process.env.UPPOINT_SMS_API_URL,
  UPPOINT_SMS_USERNAME: process.env.UPPOINT_SMS_USERNAME,
  UPPOINT_SMS_PASSWORD: process.env.UPPOINT_SMS_PASSWORD,
  UPPOINT_SMS_SOURCE_ADDR: process.env.UPPOINT_SMS_SOURCE_ADDR,
  UPPOINT_SMS_VALID_FOR: process.env.UPPOINT_SMS_VALID_FOR,
  UPPOINT_SMS_DATACODING: process.env.UPPOINT_SMS_DATACODING,
});

if (!parsedEnv.success) {
  console.error(
    "Invalid environment configuration",
    parsedEnv.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;
