import { z } from "zod";

import { isLoopbackHost } from "@/lib/security/request-guards";

const booleanFromString = z.preprocess((value) => {
  if (typeof value === "string") {
    return value === "true";
  }

  return value;
}, z.boolean());

function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHost(new URL(value).host);
  } catch {
    return false;
  }
}

const proxyEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  UPPOINT_ALLOWED_HOSTS: z.string().optional(),
  UPPOINT_ALLOWED_ORIGINS: z.string().optional(),
  INTERNAL_AUDIT_TOKEN: z.string().min(32).optional(),
  INTERNAL_AUDIT_SIGNING_SECRET: z.string().min(32).optional(),
  INTERNAL_AUDIT_ENDPOINT_URL: z.string().url().optional(),
  INTERNAL_AUTH_TRANSPORT_MODE: z.enum(["loopback-hmac-v1", "mtls-hmac-v1"]).default("loopback-hmac-v1"),
  UPPOINT_CLOSED_SYSTEM_MODE: booleanFromString.default(true),
  AUTH_SECRET: z.string().min(32).optional(),
}).superRefine((input, context) => {
  if (input.NODE_ENV !== "production") {
    return;
  }

  if (!input.NEXT_PUBLIC_APP_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NEXT_PUBLIC_APP_URL"],
      message: "NEXT_PUBLIC_APP_URL is required in production",
    });
  }

  if (!input.AUTH_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_SECRET"],
      message: "AUTH_SECRET is required in production",
    });
  }

  if (
    input.UPPOINT_CLOSED_SYSTEM_MODE
    && input.INTERNAL_AUDIT_ENDPOINT_URL
    && !isLoopbackUrl(input.INTERNAL_AUDIT_ENDPOINT_URL)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["INTERNAL_AUDIT_ENDPOINT_URL"],
      message: "Closed-system mode requires INTERNAL_AUDIT_ENDPOINT_URL to stay on loopback",
    });
  }
});

const parsedProxyEnv = proxyEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  UPPOINT_ALLOWED_HOSTS: process.env.UPPOINT_ALLOWED_HOSTS,
  UPPOINT_ALLOWED_ORIGINS: process.env.UPPOINT_ALLOWED_ORIGINS,
  INTERNAL_AUDIT_TOKEN: process.env.INTERNAL_AUDIT_TOKEN,
  INTERNAL_AUDIT_SIGNING_SECRET: process.env.INTERNAL_AUDIT_SIGNING_SECRET,
  INTERNAL_AUDIT_ENDPOINT_URL: process.env.INTERNAL_AUDIT_ENDPOINT_URL,
  INTERNAL_AUTH_TRANSPORT_MODE: process.env.INTERNAL_AUTH_TRANSPORT_MODE,
  UPPOINT_CLOSED_SYSTEM_MODE: process.env.UPPOINT_CLOSED_SYSTEM_MODE,
  AUTH_SECRET: process.env.AUTH_SECRET,
});

if (!parsedProxyEnv.success) {
  console.error("Invalid proxy environment configuration", parsedProxyEnv.error.flatten().fieldErrors);
  throw new Error("Invalid proxy environment configuration");
}

export const proxyEnv = parsedProxyEnv.data;
