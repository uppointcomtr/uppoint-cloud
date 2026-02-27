import { enMessages } from "@/messages/en";
import { trMessages } from "@/messages/tr";
import type { Locale } from "@/modules/i18n/config";

const dictionaries = {
  tr: trMessages,
  en: enMessages,
} as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
