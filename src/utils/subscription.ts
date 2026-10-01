import { CategoryLabel, DataCentre } from "../constants";
import type { SubscriptionFilters } from "../services/store";
import { truncate } from "./text";

export function displaySubscriptionFilters(
  filters: SubscriptionFilters,
  labelLimit = Infinity,
) {
  const centres = filters.dataCentres?.map(
    (value) => DataCentre[value as keyof typeof DataCentre],
  );
  const categories = filters.categories?.map((value) => CategoryLabel[value]);
  return `数据中心: ${truncate(centres?.join("、") || "不限", labelLimit)}\n招募类型: ${truncate(categories?.join("、") || "不限", labelLimit)}`;
}
