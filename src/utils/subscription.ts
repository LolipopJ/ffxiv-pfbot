import { DATA_CENTRE_LABEL } from "../constants/recruitment";
import { type Locale, locale } from "../locales";
import { translateCategory } from "../locales/utils/format";
import type { SubscriptionFilters } from "../services/store";
import { truncate } from "./text";

export function displaySubscriptionFilters(
  filters: SubscriptionFilters,
  labelLimit = Infinity,
  language: Locale = locale,
) {
  const centres = filters.dataCentres?.map((value) =>
    Object.hasOwn(DATA_CENTRE_LABEL, value)
      ? DATA_CENTRE_LABEL[value as keyof typeof DATA_CENTRE_LABEL]
      : value,
  );
  const categories = filters.categories?.map((value) =>
    translateCategory(value, language),
  );
  const { listSeparator, unlimited } = language.messages.common;
  return language.messages.filters({
    centres: truncate(centres?.join(listSeparator) || unlimited, labelLimit),
    categories: truncate(
      categories?.join(listSeparator) || unlimited,
      labelLimit,
    ),
  });
}
