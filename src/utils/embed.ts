import { EmbedBuilder, escapeMarkdown } from "discord.js";

import { type Locale, locale } from "../locales";
import {
  formatExpiry,
  translateCategory,
  translateDescriptionTags,
  translateDuty,
  translateJob,
} from "../locales/utils/format";
import type {
  Category,
  Job,
  Recruitment,
  Slot,
  SlotRole,
} from "../types/recruitment";
import { getListingExpiresAt, LISTING_LIFETIME_MS } from "./listing-time";
import { truncate } from "./text";

const ROLE_EMOJI: Record<SlotRole, string> = {
  tank: "🛡️",
  healer: "💚",
  dps: "🗡️",
  empty: "⬜️",
  none: "",
};

const MELEE_DPS: Job[] = [
  "MNK",
  "PGL",
  "DRG",
  "LNC",
  "NIN",
  "ROG",
  "SAM",
  "RPR",
  "VPR",
];

const RANGED_PHYSICAL_DPS: Job[] = ["BRD", "ARC", "MCH", "DNC"];

const RANGED_MAGICAL_DPS: Job[] = ["BLM", "THM", "SMN", "ACN", "RDM", "PCT"];

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

export function buildPartyField(slots: Slot[], language: Locale = locale) {
  const render = (hideOptionalJobs: boolean) =>
    slots
      .map((slot) => {
        if (slot.filled) {
          const filledJob = slot.acceptedJobs[0] as Job;
          let roleEmoji = ROLE_EMOJI[slot.role[0] ?? "none"] || "✅️";
          if (MELEE_DPS.includes(filledJob)) {
            roleEmoji = "🥊";
          } else if (RANGED_PHYSICAL_DPS.includes(filledJob)) {
            roleEmoji = "🏹";
          } else if (RANGED_MAGICAL_DPS.includes(filledJob)) {
            roleEmoji = "🪄";
          } else if (filledJob === "BSM") {
            roleEmoji = "🦖";
          } else if (filledJob === "BLM") {
            roleEmoji = "🧙‍♂️";
          }
          return `${roleEmoji}${translateJob(filledJob, language)}`;
        }
        return hideOptionalJobs || slot.acceptedJobs.length === 0
          ? "⬜️"
          : `❓️${
              slot.acceptedJobs.length > 6
                ? slot.acceptedJobs.slice(0, 6).join(", ") + "..."
                : slot.acceptedJobs.join(", ")
            }`;
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
  const expiresAt = getListingExpiresAt(expires, now);
  return expiresAt === null ? null : expiresAt - LISTING_LIFETIME_MS;
}

function escapedField(text: string) {
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

export function buildListingEmbed(
  listing: Recruitment,
  now = Date.now(),
  language: Locale = locale,
) {
  const messages = language.messages.embed;
  const embed = new EmbedBuilder()
    .setColor(getColor(listing.category))
    .setTitle(field(translateDuty(listing.duty, language), 256))
    .setFields([
      {
        name: messages.description,
        value: escapedField(
          translateDescriptionTags(listing.description, language),
        ),
        inline: true,
      },
      {
        name: messages.category,
        value: field(translateCategory(listing.category, language), 128),
        inline: true,
      },
      {
        name: messages.server,
        value: field(`${listing.dataCentre} · ${listing.world}`, 128),
        inline: true,
      },
      {
        name: messages.creator,
        value: field(listing.creator, 256),
        inline: true,
      },
      {
        name: messages.minIlvl,
        value: field(listing.minIlvl, 32),
        inline: true,
      },
      {
        name: messages.expires,
        value: field(formatExpiry(listing.expires, language), 128),
        inline: true,
      },
      {
        name: messages.party({
          current: Number.isFinite(listing.current) ? listing.current : "?",
          total: Number.isFinite(listing.total) ? listing.total : "?",
        }),
        value: buildPartyField(listing.slots, language),
        inline: false,
      },
    ]);

  const publishedAt = getListingPublishedAt(listing.expires, now);
  if (publishedAt !== null) embed.setTimestamp(publishedAt);

  return embed;
}
