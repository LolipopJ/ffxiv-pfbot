import type { Language, Locale } from "../types/locale";
import chs from "./chs";
import de from "./de";
import en from "./en";
import fr from "./fr";
import ja from "./ja";
import ko from "./ko";
import { resolveLanguage } from "./utils/config";

export const LOCALES: Readonly<Record<Language, Locale>> = {
  EN: en,
  CHS: chs,
  DE: de,
  FR: fr,
  JA: ja,
  KO: ko,
};

// Instance-wide language is fixed at process startup.
export const locale = LOCALES[resolveLanguage(process.env.LANGUAGE)];
export type { Language, Locale } from "../types/locale";
