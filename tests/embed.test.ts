import { expect, test } from "bun:test";

import { buildNotification } from "../src/services/monitor";
import type { Slot } from "../src/types/recruitment";
import { buildListingEmbed, buildPartyField } from "../src/utils/embed";
import { listing } from "./helpers";

test("long party fields hide optional jobs while preserving occupied and vacant slots", () => {
  const slots: Slot[] = [
    { filled: true, role: ["tank"], acceptedJobs: ["PLD"] },
    ...Array.from({ length: 7 }, () => ({
      filled: false,
      role: ["dps"] as Slot["role"],
      acceptedJobs: Array.from({ length: 40 }, (_, i) => "JOB" + i),
    })),
  ];
  const result = buildPartyField(slots);
  expect(result).toContain("PLD");
  expect(result).not.toContain("JOB");
  expect(result.split(" | ")).toHaveLength(8);
  expect(result.match(/⬜️/g)).toHaveLength(7);
  expect(result.length).toBeLessThanOrEqual(1024);
});

test("short party fields retain selectable jobs", () => {
  expect(
    buildPartyField([
      { filled: false, role: ["dps"], acceptedJobs: ["MNK", "SAM"] },
    ]),
  ).toBe("(MNK, SAM)");
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
    embed.footer!.text.length +
    embed.fields!.reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    );
  expect(length).toBeLessThanOrEqual(6000);
  const notification = buildNotification(
    listing(),
    Array.from({ length: 100 }, () => long),
  );
  expect(notification.payload.content.length).toBeLessThanOrEqual(2000);
  expect(notification.payload.allowedMentions.parse).toEqual([]);
});

test("clock changes alone do not change notification fingerprints", () => {
  const first = buildNotification(listing(), ["Ultimate"]);
  const second = buildNotification(listing(), ["Ultimate"]);
  expect(first.payloadHash).toBe(second.payloadHash);
  expect(
    buildNotification(listing({ description: "Changed" }), ["Ultimate"])
      .payloadHash,
  ).not.toBe(first.payloadHash);
});
