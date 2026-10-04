import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { LOCALES } from "../src/locales";
import { buildNotification as buildNotificationWithLocale } from "../src/services/monitor";
import type { Slot } from "../src/types/recruitment";
import {
  buildListingEmbed as buildListingEmbedWithLocale,
  buildPartyField as buildPartyFieldWithLocale,
  getListingPublishedAt,
} from "../src/utils/embed";
import { listing } from "./helpers";

const buildListingEmbed: typeof buildListingEmbedWithLocale = (
  listing,
  now,
  language = LOCALES.CHS,
) => buildListingEmbedWithLocale(listing, now, language);
const buildPartyField: typeof buildPartyFieldWithLocale = (
  slots,
  language = LOCALES.CHS,
) => buildPartyFieldWithLocale(slots, language);
const buildNotification: typeof buildNotificationWithLocale = (
  listing,
  patterns,
  now,
  language = LOCALES.CHS,
) => buildNotificationWithLocale(listing, patterns, now, language);

afterEach(() => mock.restore());

test("long party fields hide optional jobs while preserving occupied and vacant slots", () => {
  const slots: Slot[] = [
    { filled: true, role: ["tank"], acceptedJobs: ["PLD"] },
    ...Array.from({ length: 39 }, () => ({
      filled: false,
      role: ["dps"] as Slot["role"],
      acceptedJobs: Array.from(
        { length: 40 },
        (_, i) => "JOB" + i,
      ) as Slot["acceptedJobs"],
    })),
  ];
  const result = buildPartyField(slots);
  expect(result).toContain("骑士");
  expect(result).not.toContain("JOB");
  expect(result.split(" | ")).toHaveLength(40);
  expect(result.match(/⬜️/g)).toHaveLength(39);
  expect(result.length).toBeLessThanOrEqual(1024);
});

test("short party fields retain selectable jobs", () => {
  expect(
    buildPartyField([
      { filled: false, role: ["dps"], acceptedJobs: ["MNK", "SAM"] },
    ]),
  ).toBe("❓️武僧, 武士");
});

test("all embed fields and aggregate content stay inside Discord limits", () => {
  const long = "x".repeat(10_000);
  const embed = buildListingEmbed(
    listing({
      duty: long,
      description: long,
      creator: long,
      world: long,
      minIlvl: long,
      expires: long,
      id: long,
      dataCentre: long,
    }),
  ).toJSON();
  expect(embed.title!.length).toBeLessThanOrEqual(256);
  expect(
    embed.fields!.every(
      (field) => field.value.length <= 1024 && field.value.length > 0,
    ),
  ).toBe(true);
  const length =
    embed.title!.length +
    (embed.footer?.text.length ?? 0) +
    embed.fields!.reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    );
  expect(length).toBeLessThanOrEqual(6000);
  const notification = buildNotification(
    listing(),
    Array.from({ length: 100 }, () => long),
  );
  expect(
    notification.payload.embeds[0]!.toJSON().footer!.text.length,
  ).toBeLessThanOrEqual(512);
  expect(notification.payload.allowedMentions.parse).toEqual([]);
});

test("clock changes alone do not change notification fingerprints", () => {
  const clock = spyOn(Date, "now").mockReturnValue(
    Date.parse("2026-10-01T12:00:00.000Z"),
  );
  const first = buildNotification(listing(), ["Ultimate"]);
  clock.mockReturnValue(Date.parse("2026-10-01T12:05:00.000Z"));
  const second = buildNotification(listing(), ["Ultimate"]);
  expect(first.payloadHash).toBe(second.payloadHash);
  expect(
    buildNotification(listing({ description: "Changed" }), ["Ultimate"])
      .payloadHash,
  ).not.toBe(first.payloadHash);
});

test.each([
  ["in 16 seconds", 16_000],
  ["in 14 minutes", 14 * 60_000],
  ["in an hour", 3_600_000],
  ["in a minute", 60_000],
  ["in a second", 1000],
  ["in 1 hour", 3_600_000],
  [" IN  2 MINUTES ", 120_000],
  ["now", 0],
] as const)(
  "embed timestamps infer publication from %s",
  (expires, remaining) => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    const publishedAt = now + remaining - 3_600_000;
    expect(getListingPublishedAt(expires, now)).toBe(publishedAt);
    expect(
      buildListingEmbed(listing({ expires }), now).toJSON().timestamp,
    ).toBe(new Date(publishedAt).toISOString());
  },
);

test.each(["", "unknown", "in two minutes", "in -1 minutes", "in 2 hours"])(
  "unrecognized expiry %s does not fabricate a publication timestamp",
  (expires) => {
    expect(getListingPublishedAt(expires)).toBeNull();
    expect(
      buildListingEmbed(listing({ expires })).toJSON().timestamp,
    ).toBeUndefined();
  },
);

test.each([
  ["[Practice] P5 中文", "[练习] P5 中文"],
  [
    "[Loot][Duty Complete][One Player per Job] 消化  ST、D1〆    ヤーン　3塔後バースト 2から時計90°",
    "[反复攻略][任务已完成][职业不重复] 消化  ST、D1〆    ヤーン　3塔後バースト 2から時計90°",
  ],
  ["[None][Duty Completion] 攻略", "[无][完成任务] 攻略"],
  ["[Unknown][Loot] 攻略 [Practice]", "[Unknown][反复攻略] 攻略 [Practice]"],
  ["攻略 [Loot]", "攻略 [Loot]"],
  ["[toString] 攻略", "[toString] 攻略"],
  ["**bold**", "\\*\\*bold\\*\\*"],
  ["_italic_", "\\_italic\\_"],
  ["__underline__", "\\_\\_underline\\_\\_"],
  ["~~strike~~", "\\~\\~strike\\~\\~"],
  ["||spoiler||", "\\|\\|spoiler\\|\\|"],
  ["`code`", "\\`code\\`"],
  ["```code```", "\\`\\`\\`code\\`\\`\\`"],
  ["# heading", "\\# heading"],
  ["- item", "\\- item"],
  ["1. item", "1\\. item"],
  ["> quote", "\\> quote"],
  ["-# subtext", "\\-# subtext"],
  ["[link](https://example.com)", "\\[link](https://example.com)"],
  ["\\path", "\\\\path"],
])("description preserves %s as literal text", (description, expected) => {
  const embed = buildListingEmbed(listing({ description })).toJSON();
  expect(embed.fields![0]!.value).toBe(expected);
});

test("escaped descriptions stay in bounds without cutting an escape sequence", () => {
  const description = "x".repeat(1022) + "**bold**";
  const value = buildListingEmbed(listing({ description })).toJSON().fields![0]!
    .value;
  expect(value).toBe("x".repeat(1022) + "…");
  expect(value.length).toBeLessThanOrEqual(1024);
  expect(
    buildListingEmbed(listing({ description: "" })).toJSON().fields![0]!.value,
  ).toBe("—");
});
