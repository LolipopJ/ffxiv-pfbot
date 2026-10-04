import type { Locale } from "../../types/locale";
import type { Category, Job } from "../../types/recruitment";
import { parseListingExpiry } from "../../utils/listing-time";
import { LOCALES } from "../index";
import { normalizeDictionaryKey } from "./config";

function ownValue(values: Readonly<Record<string, string>>, key: string) {
  return Object.hasOwn(values, key) ? values[key] : undefined;
}

export function translateDuty(duty: string, locale: Locale) {
  if (!duty) return locale.messages.common.unknown;
  if (locale.language === "EN") return duty;
  return ownValue(locale.dictionary, normalizeDictionaryKey(duty)) || duty;
}

export function translateCategory(category: Category, locale: Locale) {
  return (
    ownValue(locale.categories, category) ||
    ownValue(LOCALES.EN.categories, category) ||
    category
  );
}

export function translateJob(job: Job, locale: Locale) {
  return ownValue(locale.jobs, job) || ownValue(LOCALES.EN.jobs, job) || job;
}

export function translateDescriptionTags(description: string, locale: Locale) {
  if (locale.language === "EN") return description;
  return description.replace(/^(?:\[[^[\]\r\n]+\])+/, (tags) =>
    tags.replace(/\[([^[\]\r\n]+)\]/g, (tag, label: string) => {
      const translated =
        ownValue(locale.tags, label) || ownValue(LOCALES.EN.tags, label);
      return translated ? `[${translated}]` : tag;
    }),
  );
}

export function formatExpiry(expires: string, locale: Locale) {
  if (locale.language === "EN") return expires;
  const parsed = parseListingExpiry(expires);
  if (!parsed) return expires;
  if (parsed.amount === 0) return locale.messages.common.now;
  return new Intl.RelativeTimeFormat(locale.intlLocale, {
    numeric: "always",
  }).format(parsed.amount, parsed.unit);
}
