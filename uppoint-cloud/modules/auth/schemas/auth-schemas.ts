import { z } from "zod";

import { defaultLocale, type Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());

function getValidationMessages(locale: Locale) {
  return getDictionary(locale).validation;
}

function createPhoneSchema(locale: Locale) {
  const validation = getValidationMessages(locale);

  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\+?[1-9]\d{9,14}$/.test(value),
      validation.phoneFormat,
    );
}

function createPasswordSchema(locale: Locale) {
  const validation = getValidationMessages(locale);

  return z
    .string()
    .min(12, validation.passwordMin)
    .max(72, validation.passwordMax)
    .regex(/[a-z]/, validation.passwordLowercase)
    .regex(/[A-Z]/, validation.passwordUppercase)
    .regex(/[0-9]/, validation.passwordNumber)
    .regex(/[^A-Za-z0-9]/, validation.passwordSymbol);
}

export function getRegisterSchema(locale: Locale = defaultLocale) {
  const validation = getValidationMessages(locale);

  return z.object({
    name: z.string().trim().min(2, validation.nameMin).max(100),
    email: emailSchema,
    phone: createPhoneSchema(locale).default(""),
    password: createPasswordSchema(locale),
  });
}

export function getLoginSchema(locale: Locale = defaultLocale) {
  const validation = getValidationMessages(locale);

  return z.object({
    email: emailSchema,
    password: z.string().min(1, validation.loginPasswordRequired),
  });
}

export const registerSchema = getRegisterSchema();
export const loginSchema = getLoginSchema();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
