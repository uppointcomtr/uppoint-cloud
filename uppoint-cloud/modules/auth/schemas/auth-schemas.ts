import { z } from "zod";

import { defaultLocale, type Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

function getValidationMessages(locale: Locale) {
  return getDictionary(locale).validation;
}

function createEmailSchema(locale: Locale) {
  const validation = getValidationMessages(locale);

  return z
    .string()
    .trim()
    .min(1, validation.emailInvalid)
    .email(validation.emailInvalid)
    .max(254, validation.emailInvalid)
    .transform((value) => value.toLowerCase());
}

function createPhoneSchema(locale: Locale) {
  const validation = getValidationMessages(locale);

  return z
    .string()
    .trim()
    .min(1, validation.phoneRequired)
    .refine((value) => /^\+?[1-9]\d{9,14}$/.test(value), validation.phoneFormat);
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
    name: z.string().trim().min(3, validation.nameMin).max(100),
    email: createEmailSchema(locale),
    phone: createPhoneSchema(locale),
    password: createPasswordSchema(locale),
  });
}

export function getLoginSchema(locale: Locale = defaultLocale) {
  const validation = getValidationMessages(locale);

  return z.object({
    email: createEmailSchema(locale),
    password: z.string().min(1, validation.loginPasswordRequired),
  });
}

export function getPhoneLoginSchema(locale: Locale = defaultLocale) {
  return z.object({
    phone: createPhoneSchema(locale),
  });
}

export function getLoginOtpSchema(locale: Locale = defaultLocale) {
  const validation = getValidationMessages(locale);

  return z.object({
    code: z.string().trim().regex(/^\d{6}$/, validation.otpCodeFormat),
  });
}

export const registerSchema = getRegisterSchema();
export const loginSchema = getLoginSchema();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
