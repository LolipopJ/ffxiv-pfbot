import type { Language } from "../../types/locale";
import en from "../en";

export const LANGUAGES = ["EN", "CHS", "DE", "FR", "JA", "KO"] as const;
export const TARGET_LANGUAGES = ["CHS", "DE", "FR", "JA", "KO"] as const;

export function resolveLanguage(
  value: string | undefined,
  warn: (message: string) => void = () => {},
): Language {
  const normalized = value?.trim().toUpperCase() || "EN";
  if (LANGUAGES.some((language) => language === normalized))
    return normalized as Language;
  warn(en.messages.logs.invalidLanguage({ value, supported: LANGUAGES }));
  return "EN";
}

export function normalizeDictionaryKey(value: string) {
  return value.trim().toLowerCase();
}
