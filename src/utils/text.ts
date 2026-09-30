import { escapeMarkdown } from "discord.js";

export function truncate(text: string, limit: number) {
  if (text.length <= limit) return text;
  let prefix = text.slice(0, Math.max(0, limit - 1));
  // Do not split a UTF-16 surrogate pair when shortening emoji.
  if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
  return prefix + "…";
}

export function displayPattern(pattern: string, limit = 180) {
  return truncate(escapeMarkdown(pattern.replace(/\s+/g, " ")), limit);
}
