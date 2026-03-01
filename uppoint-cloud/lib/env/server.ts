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
  AUTH_OTP_PEPPER: z.string().min(32).optional(),
  AUTH_TRUST_HOST: booleanFromString.default(false),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(180),
  HEALTHCHECK_TOKEN: z.string().min(16).optional(),
  RATE_LIMIT_REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
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
  UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS: booleanFromString.default(false),
}).superRefine((input, context) => {
  if (input.UPSTASH_REDIS_REST_URL && !input.UPSTASH_REDIS_REST_TOKEN) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["UPSTASH_REDIS_REST_TOKEN"],
      message: "UPSTASH_REDIS_REST_TOKEN is required when UPSTASH_REDIS_REST_URL is set",
    });
  }

  if (input.UPSTASH_REDIS_REST_TOKEN && !input.UPSTASH_REDIS_REST_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["UPSTASH_REDIS_REST_URL"],
      message: "UPSTASH_REDIS_REST_URL is required when UPSTASH_REDIS_REST_TOKEN is set",
    });
  }

  const hasLocalRateLimitRedis = Boolean(input.RATE_LIMIT_REDIS_URL);
  const hasUpstashRateLimitRedis = Boolean(input.UPSTASH_REDIS_REST_URL && input.UPSTASH_REDIS_REST_TOKEN);

  if (input.NODE_ENV === "production" && !hasLocalRateLimitRedis && !hasUpstashRateLimitRedis) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RATE_LIMIT_REDIS_URL"],
      message: "Production requires Redis-backed auth rate limiting (RATE_LIMIT_REDIS_URL or Upstash credentials)",
    });
  }

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

    if (input.NODE_ENV === "production" && !input.UPPOINT_EMAIL_USE_TLS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPPOINT_EMAIL_USE_TLS"],
        message: "UPPOINT_EMAIL_USE_TLS must be true in production when SMTP is enabled",
      });
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
  AUTH_OTP_PEPPER: process.env.AUTH_OTP_PEPPER,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  AUTH_BCRYPT_ROUNDS: process.env.AUTH_BCRYPT_ROUNDS,
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES,
  AUDIT_LOG_RETENTION_DAYS: process.env.AUDIT_LOG_RETENTION_DAYS,
  HEALTHCHECK_TOKEN: process.env.HEALTHCHECK_TOKEN,
  RATE_LIMIT_REDIS_URL: process.env.RATE_LIMIT_REDIS_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
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
  UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS: process.env.UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS,
});

if (!parsedEnv.success) {
  console.error(
    "Invalid environment configuration",
    parsedEnv.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;
