import { EmbedBuilder, escapeMarkdown } from "discord.js";

import type {
  Category,
  Recruitment,
  Slot,
  SlotRole,
} from "../types/recruitment";
import { truncate } from "./text";

const ROLE_EMOJI: Record<SlotRole, string> = {
  tank: "🛡️",
  healer: "💚",
  dps: "🗡️",
  empty: "⬜️",
  none: "",
};

function getColor(category: Category): number {
  switch (category) {
    case "HighEndDuty":
      return 0xff4500; // 橙红 - 高难度任务
    case "Raids":
      return 0x9370db; // 紫色 - 大型任务
    case "Trials":
      return 0x4682b4; // 钢蓝 - 讨伐歼灭战
    case "TreasureHunt":
      return 0xdaa520; // 金色 - 寻宝
    default:
      return 0x808080; // 默认灰色
  }
}

export function buildPartyField(slots: Slot[]) {
  const render = (hideOptionalJobs: boolean) =>
    slots
      .map((slot) => {
        if (slot.filled) {
          return `${ROLE_EMOJI[slot.role[0] ?? "none"] || "✅️"}${truncate(slot.acceptedJobs[0] || "", 8)}`;
        }
        return hideOptionalJobs || slot.acceptedJobs.length === 0
          ? "⬜️"
          : `❓️${slot.acceptedJobs.join(", ")}`;
      })
      .join(" | ");
  const detailed = render(false);
  return (
    truncate(detailed.length > 1024 ? render(true) : detailed, 1024) || "—"
  );
}

export function field(text: string, limit = 1024) {
  return truncate(text || "—", limit);
}

export function getListingPublishedAt(expires: string, now = Date.now()) {
  const match = /^in\s+(\d+|an?)\s+(seconds?|minutes?|hours?)$/i.exec(
    expires.trim(),
  );
  if (!match)
    return expires.trim().toLowerCase() === "now" ? now - 3_600_000 : null;
  const amount = /^\d+$/.test(match[1]!) ? Number(match[1]) : 1;
  const unit = match[2]!.toLowerCase();
  const remaining =
    amount *
    (unit.startsWith("hour")
      ? 3_600_000
      : unit.startsWith("minute")
        ? 60_000
        : 1000);
  if (!Number.isFinite(remaining) || remaining > 3_600_000) return null;
  return now + remaining - 3_600_000;
}

function descriptionField(text: string) {
  const escaped = escapeMarkdown(text, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  }).replace(/^( *)(>|-#)/gm, "$1\\$2");
  const value = field(escaped);
  if (escaped.length <= 1024) return value;
  const prefix = value.slice(0, -1);
  const trailingSlashes = prefix.match(/\\+$/)?.[0].length ?? 0;
  // Truncation must not leave half of a Markdown escape sequence.
  return (trailingSlashes % 2 ? prefix.slice(0, -1) : prefix) + "…";
}

export function buildListingEmbed(listing: Recruitment, now = Date.now()) {
  const embed = new EmbedBuilder()
    .setColor(getColor(listing.category))
    .setTitle(field(listing.duty || "FF14 Party Finder", 256))
    .setFields([
      {
        name: "📃 招募描述",
        value: descriptionField(listing.description),
        inline: true,
      },
      { name: "🫅 招募人", value: field(listing.creator, 256), inline: true },
      { name: "🌍 服务器", value: field(listing.world, 128), inline: true },
      { name: "⚔️ 最低装等", value: field(listing.minIlvl, 32), inline: true },
      { name: "⏳ 招募期限", value: field(listing.expires, 128), inline: true },
      {
        name: `🎯 队伍状态 (${Number.isFinite(listing.current) ? listing.current : "?"}/${Number.isFinite(listing.total) ? listing.total : "?"})`,
        value: buildPartyField(listing.slots),
        inline: false,
      },
    ]);

  const publishedAt = getListingPublishedAt(listing.expires, now);
  if (publishedAt !== null) embed.setTimestamp(publishedAt);

  return embed;
}
