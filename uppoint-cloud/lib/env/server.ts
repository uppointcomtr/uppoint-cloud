import "server-only";

import { z } from "zod";

const booleanFromString = z.preprocess((value) => {
  if (typeof value === "string") {
    return value === "true";
  }

  return value;
}, z.boolean());

const emailBackendSchema = z.enum(["smtp", "disabled"]);

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_OTP_PEPPER: z.string().min(32).optional(),
  INTERNAL_AUDIT_TOKEN: z.string().min(32).optional(),
  INTERNAL_DISPATCH_TOKEN: z.string().min(32).optional(),
  INTERNAL_AUDIT_SIGNING_SECRET: z.string().min(32).optional(),
  INTERNAL_DISPATCH_SIGNING_SECRET: z.string().min(32).optional(),
  INTERNAL_AUTH_TRANSPORT_MODE: z.enum(["loopback-hmac-v1", "mtls-hmac-v1"]).default("loopback-hmac-v1"),
  INTERNAL_AUDIT_ENDPOINT_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: booleanFromString.default(false),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  AUTH_SESSION_REVALIDATE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(180),
  AUDIT_FALLBACK_LOG_PATH: z.string().trim().min(1).optional(),
  AUDIT_LOG_SIGNING_SECRET: z.string().min(32).optional(),
  HEALTHCHECK_TOKEN: z.string().min(16).optional(),
  UPPOINT_ALLOWED_HOSTS: z.string().optional(),
  UPPOINT_ALLOWED_ORIGINS: z.string().optional(),
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
  NOTIFICATION_PAYLOAD_SECRET: z.string().min(32).optional(),
}).superRefine((input, context) => {
  let appUrl: URL | null = null;
  let databaseUrl: URL | null = null;

  try {
    appUrl = new URL(input.NEXT_PUBLIC_APP_URL);
  } catch {
    // NEXT_PUBLIC_APP_URL format validation is already handled by zod.
  }

  try {
    databaseUrl = new URL(input.DATABASE_URL);
  } catch {
    // DATABASE_URL format validation is already handled by zod.
  }

  if (input.NODE_ENV === "production") {
    if (!appUrl || appUrl.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "NEXT_PUBLIC_APP_URL must use https in production",
      });
    }

    if (!input.AUTH_TRUST_HOST) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_TRUST_HOST"],
        message: "AUTH_TRUST_HOST must be true in production",
      });
    }

    if (!input.HEALTHCHECK_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["HEALTHCHECK_TOKEN"],
        message: "HEALTHCHECK_TOKEN is required in production",
      });
    }

    if (!input.AUTH_OTP_PEPPER) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_OTP_PEPPER"],
        message: "AUTH_OTP_PEPPER must be set in production",
      });
    }

    if (!input.INTERNAL_AUDIT_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_AUDIT_TOKEN"],
        message: "INTERNAL_AUDIT_TOKEN must be set in production",
      });
    }

    if (!input.INTERNAL_DISPATCH_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_DISPATCH_TOKEN"],
        message: "INTERNAL_DISPATCH_TOKEN must be set in production",
      });
    }

    if (!input.INTERNAL_AUDIT_SIGNING_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_AUDIT_SIGNING_SECRET"],
        message: "INTERNAL_AUDIT_SIGNING_SECRET must be set in production",
      });
    }

    if (!input.INTERNAL_DISPATCH_SIGNING_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_DISPATCH_SIGNING_SECRET"],
        message: "INTERNAL_DISPATCH_SIGNING_SECRET must be set in production",
      });
    }

    if (!input.NOTIFICATION_PAYLOAD_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NOTIFICATION_PAYLOAD_SECRET"],
        message: "NOTIFICATION_PAYLOAD_SECRET must be set in production",
      });
    }

    if (input.UPPOINT_EMAIL_BACKEND !== "smtp") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPPOINT_EMAIL_BACKEND"],
        message: "UPPOINT_EMAIL_BACKEND must be smtp in production for OTP delivery",
      });
    }

    if (!input.UPPOINT_SMS_ENABLED) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPPOINT_SMS_ENABLED"],
        message: "UPPOINT_SMS_ENABLED must be true in production for OTP delivery",
      });
    }

    if (databaseUrl) {
      const isLocalDatabaseHost = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
      const sslMode = databaseUrl.searchParams.get("sslmode");

      if (!isLocalDatabaseHost && sslMode !== "require" && sslMode !== "verify-full") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "Non-local PostgreSQL production connections must include sslmode=require (or verify-full)",
        });
      }
    }

    if (appUrl) {
      const canonicalHost = appUrl.host.toLowerCase();
      const canonicalOrigin = appUrl.origin.toLowerCase();
      const allowedHosts = parseCsv(input.UPPOINT_ALLOWED_HOSTS).map((value) => value.toLowerCase());
      const allowedOrigins = parseCsv(input.UPPOINT_ALLOWED_ORIGINS).map((value) => value.toLowerCase());

      if (allowedHosts.length > 0 && !allowedHosts.includes(canonicalHost)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPPOINT_ALLOWED_HOSTS"],
          message: "UPPOINT_ALLOWED_HOSTS must include NEXT_PUBLIC_APP_URL host",
        });
      }

      if (allowedOrigins.length > 0 && !allowedOrigins.includes(canonicalOrigin)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPPOINT_ALLOWED_ORIGINS"],
          message: "UPPOINT_ALLOWED_ORIGINS must include NEXT_PUBLIC_APP_URL origin",
        });
      }
    }
  }

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
  INTERNAL_AUDIT_TOKEN: process.env.INTERNAL_AUDIT_TOKEN,
  INTERNAL_DISPATCH_TOKEN: process.env.INTERNAL_DISPATCH_TOKEN,
  INTERNAL_AUDIT_SIGNING_SECRET: process.env.INTERNAL_AUDIT_SIGNING_SECRET,
  INTERNAL_DISPATCH_SIGNING_SECRET: process.env.INTERNAL_DISPATCH_SIGNING_SECRET,
  INTERNAL_AUTH_TRANSPORT_MODE: process.env.INTERNAL_AUTH_TRANSPORT_MODE,
  INTERNAL_AUDIT_ENDPOINT_URL: process.env.INTERNAL_AUDIT_ENDPOINT_URL,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  AUTH_BCRYPT_ROUNDS: process.env.AUTH_BCRYPT_ROUNDS,
  AUTH_SESSION_REVALIDATE_SECONDS: process.env.AUTH_SESSION_REVALIDATE_SECONDS,
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES,
  AUDIT_LOG_RETENTION_DAYS: process.env.AUDIT_LOG_RETENTION_DAYS,
  AUDIT_FALLBACK_LOG_PATH: process.env.AUDIT_FALLBACK_LOG_PATH,
  AUDIT_LOG_SIGNING_SECRET: process.env.AUDIT_LOG_SIGNING_SECRET,
  HEALTHCHECK_TOKEN: process.env.HEALTHCHECK_TOKEN,
  UPPOINT_ALLOWED_HOSTS: process.env.UPPOINT_ALLOWED_HOSTS,
  UPPOINT_ALLOWED_ORIGINS: process.env.UPPOINT_ALLOWED_ORIGINS,
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
  NOTIFICATION_PAYLOAD_SECRET: process.env.NOTIFICATION_PAYLOAD_SECRET,
});

if (!parsedEnv.success) {
  console.error(
    "Invalid environment configuration",
    parsedEnv.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;
