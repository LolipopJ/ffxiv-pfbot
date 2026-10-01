import { CATEGORY_LABEL, DATA_CENTRE } from "../constants";
import type { SubscriptionFilters } from "../services/store";
import { truncate } from "./text";

export function displaySubscriptionFilters(
  filters: SubscriptionFilters,
  labelLimit = Infinity,
) {
  const centres = filters.dataCentres?.map(
    (value) => DATA_CENTRE[value as keyof typeof DATA_CENTRE],
  );
  const categories = filters.categories?.map((value) => CATEGORY_LABEL[value]);
  return `数据中心: ${truncate(centres?.join("、") || "不限", labelLimit)}\n招募类型: ${truncate(categories?.join("、") || "不限", labelLimit)}`;
}
