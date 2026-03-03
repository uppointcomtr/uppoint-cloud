import { z } from "zod";

const proxyEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  UPPOINT_ALLOWED_HOSTS: z.string().optional(),
  UPPOINT_ALLOWED_ORIGINS: z.string().optional(),
  INTERNAL_AUDIT_TOKEN: z.string().min(32).optional(),
  INTERNAL_AUDIT_SIGNING_SECRET: z.string().min(32).optional(),
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
});

const parsedProxyEnv = proxyEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  UPPOINT_ALLOWED_HOSTS: process.env.UPPOINT_ALLOWED_HOSTS,
  UPPOINT_ALLOWED_ORIGINS: process.env.UPPOINT_ALLOWED_ORIGINS,
  INTERNAL_AUDIT_TOKEN: process.env.INTERNAL_AUDIT_TOKEN,
  INTERNAL_AUDIT_SIGNING_SECRET: process.env.INTERNAL_AUDIT_SIGNING_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
});

if (!parsedProxyEnv.success) {
  console.error("Invalid proxy environment configuration", parsedProxyEnv.error.flatten().fieldErrors);
  throw new Error("Invalid proxy environment configuration");
}

export const proxyEnv = parsedProxyEnv.data;
