import { EmbedBuilder } from "discord.js";

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
  dps: "⚔️",
  empty: "⬜️",
  none: "",
};

function getColor(category: Category): number {
  switch (category) {
    case "HighEndDuty":
      return 0xff4500; // 橙红 - 高难
    case "Trials":
      return 0x4682b4; // 钢蓝 - 讨伐歼灭战
    case "Raids":
      return 0x9370db; // 紫色 - 普通raid
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
          : `(${slot.acceptedJobs.join(", ")})`;
      })
      .join(" | ");
  const detailed = render(false);
  return (
    truncate(detailed.length > 1024 ? render(true) : detailed, 1024) || "—"
  );
}

function field(text: string, limit = 1024) {
  return truncate(text || "—", limit);
}

export function buildListingEmbed(listing: Recruitment) {
  const embed = new EmbedBuilder()
    .setColor(getColor(listing.category))
    .setTitle(field(listing.duty || "FF14 Party Finder", 256))
    .setFields([
      {
        name: "📃 招募描述",
        value: field(listing.description),
        inline: true,
      },
      { name: "🧑‍💼 招募人", value: field(listing.creator, 256), inline: true },
      { name: "🌍 服务器", value: field(listing.world, 128), inline: true },
      { name: "⚔️ 最低装等", value: field(listing.minIlvl, 32), inline: true },
      { name: "⏳ 剩余时间", value: field(listing.expires, 128), inline: true },
      {
        name: `🎯 队伍状态(${Number.isFinite(listing.current) ? listing.current : "?"}/${Number.isFinite(listing.total) ? listing.total : "?"})`,
        value: buildPartyField(listing.slots),
        inline: false,
      },
    ])
    .setTimestamp()
    .setFooter({
      text: field(`ID: ${listing.id} | ${listing.dataCentre}`, 512),
    });

  return embed;
}
