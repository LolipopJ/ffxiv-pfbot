import { expect, test } from "bun:test";
import { ActivityType, ComponentType, type PresenceData } from "discord.js";

import {
  CATEGORIES,
  DATA_CENTRE_LABEL,
  RECRUITMENT_TAGS,
} from "../src/constants/recruitment";
import { type Locale, LOCALES } from "../src/locales";
import { LANGUAGES, resolveLanguage } from "../src/locales/utils/config";
import {
  formatExpiry,
  translateCategory,
  translateDescriptionTags,
  translateDuty,
  translateJob,
} from "../src/locales/utils/format";
import { formatCleanupResult } from "../src/services/cleanup";
import { buildNotification } from "../src/services/monitor";
import { getKeywordError, SubscriptionStore } from "../src/services/store";
import { buildSubscriptionForm } from "../src/services/subscription-form";
import { buildSubscriptionPage } from "../src/services/subscription-pager";
import { createTaskRunner } from "../src/services/tasks";
import { getCommandContext } from "../src/utils/channel";
import { buildListingEmbed, buildPartyField } from "../src/utils/embed";
import { fakeChannel, fakeClient, listing, scopeA } from "./helpers";

test("LANGUAGE defaults to EN and accepts only supported codes after case and whitespace normalization", () => {
  for (const value of [undefined, "", "  "])
    expect(resolveLanguage(value)).toBe("EN");
  for (const code of LANGUAGES)
    expect(resolveLanguage(` ${code.toLowerCase()} `)).toBe(code);
  for (const value of ["ZH", "C.UTF-8", "en_US.UTF-8", "toString"]) {
    const warnings: string[] = [];
    expect(resolveLanguage(value, (message) => warnings.push(message))).toBe(
      "EN",
    );
    expect(warnings).toHaveLength(1);
  }
});

test.each([...LANGUAGES])(
  "%s maps recruitment at display time without altering the original data",
  (code) => {
    const language = LOCALES[code];
    const titles = {
      EN: "The Omega Protocol (Ultimate)",
      CHS: "欧米茄绝境验证战",
      DE: "Omega (fatal)",
      FR: "le Protocole Oméga (fatal)",
      JA: "絶オメガ検証戦",
      KO: "절 오메가 검증전",
    };
    const recruitment = listing({
      duty: titles.EN,
      description: "[Practice] 日本語 中文 body [Loot]",
      rawText: `${titles.EN} [Practice] 日本語 中文 body [Loot]`,
    });
    const original = structuredClone(recruitment);
    const embed = buildListingEmbed(
      recruitment,
      1_800_000_000_000,
      language,
    ).toJSON();
    expect(embed.title).toBe(titles[code]);
    expect(embed.fields![0]!.name).toBe(language.messages.embed.description);
    expect(embed.fields![0]!.value).toContain(
      `[${language.tags.Practice}] 日本語 中文 body [Loot]`,
    );
    expect(embed.fields![1]!.value).toBe(language.categories.HighEndDuty);
    expect(embed.fields![2]!.value).toBe("Mana · World");
    expect(embed.fields![3]!.value).toBe("Test @ World");
    expect(embed.fields![6]!.value).toContain(language.jobs.PLD);
    expect(recruitment).toEqual(original);
    expect(
      buildPartyField(
        [{ filled: false, role: ["tank"], acceptedJobs: ["PLD", "ANY"] }],
        language,
      ),
    ).toBe(`❓️${language.jobs.PLD}, ${language.jobs.ANY}`);
  },
);

test("EN bypasses game dictionaries and known description tag mappings", () => {
  const english: Locale = {
    ...LOCALES.EN,
    dictionary: { trial: "translated" },
    tags: { ...LOCALES.EN.tags, Practice: "translated" },
  };
  expect(translateDuty(" Trial ", english)).toBe(" Trial ");
  expect(translateDescriptionTags("[Practice] body", english)).toBe(
    "[Practice] body",
  );
});

test.each([...LANGUAGES])(
  "%s notification hashes ignore clock changes and include translated content",
  (code) => {
    const language = LOCALES[code];
    const first = buildNotification(
      listing(),
      ["Ultimate"],
      1_800_000_000_000,
      language,
    );
    const later = buildNotification(
      listing(),
      ["Ultimate"],
      1_800_000_300_000,
      language,
    );
    expect(first.payloadHash).toBe(later.payloadHash);
    expect(first.payload.embeds[0]!.toJSON().timestamp).not.toBe(
      later.payload.embeds[0]!.toJSON().timestamp,
    );
    if (code !== "EN")
      expect(first.payloadHash).not.toBe(
        buildNotification(
          listing(),
          ["Ultimate"],
          1_800_000_000_000,
          LOCALES.EN,
        ).payloadHash,
      );
  },
);

test("unknown terms and Korean version gaps fall back to the original English", () => {
  for (const language of Object.values(LOCALES)) {
    for (const name of ["Unknown future duty", "toString", "__proto__"])
      expect(translateDuty(name, language)).toBe(name);
    expect(translateJob("UNKNOWN" as never, language)).toBe("UNKNOWN");
    expect(translateCategory("UnknownCategory" as never, language)).toBe(
      "UnknownCategory",
    );
    expect(
      translateDescriptionTags("[Unknown] body [Practice]", language),
    ).toBe("[Unknown] body [Practice]");
  }
  expect(translateDuty("Dancing Mad (Ultimate)", LOCALES.KO)).toBe(
    "Dancing Mad (Ultimate)",
  );
  expect(translateDuty(" THE OMEGA PROTOCOL (ULTIMATE) ", LOCALES.CHS)).toBe(
    "欧米茄绝境验证战",
  );
});

test.each([...LANGUAGES])(
  "%s formats expiry and leaves unrecognized input intact",
  (code) => {
    const language = LOCALES[code];
    const expected = {
      EN: "in 23 minutes",
      CHS: "23分钟后",
      DE: "in 23 Minuten",
      FR: "dans 23 minutes",
      JA: "23 分後",
      KO: "23분 후",
    };
    expect(formatExpiry("in 23 minutes", language)).toBe(expected[code]);
    expect(formatExpiry("now", language)).toBe(
      code === "EN" ? "now" : language.messages.common.now,
    );
    expect(formatExpiry("unrecognized", language)).toBe("unrecognized");
    expect(formatExpiry("in 2 hours", language)).toBe("in 2 hours");
  },
);

test.each([...LANGUAGES])(
  "%s forms preserve filter IDs and keep translated components inside Discord limits",
  (code) => {
    const language = LOCALES[code];
    const store = new SubscriptionStore(":memory:");
    try {
      const sub = store.addSubscription(scopeA, "Ultimate", "user", {
        categories: ["HighEndDuty"],
        dataCentres: ["Mana"],
      });
      if (!sub.ok) throw new Error("setup failed");
      const form = buildSubscriptionForm("session", sub.sub, language).toJSON();
      expect(form.title).toBe(language.messages.form.editTitle);
      expect(form.title.length).toBeLessThanOrEqual(45);
      for (const label of form.components) {
        if (label.type !== ComponentType.Label)
          throw new Error("expected label");
        expect(label.label.length).toBeLessThanOrEqual(45);
        expect(label.description?.length ?? 0).toBeLessThanOrEqual(100);
        if (label.component.type === ComponentType.StringSelect) {
          expect(
            label.component.options.every(
              (option) => option.label.length <= 100,
            ),
          ).toBe(true);
          const ids = label.component.options.map((option) => option.value);
          expect(ids).toEqual(
            label.component.custom_id === "categories"
              ? [...CATEGORIES]
              : Object.keys(DATA_CENTRE_LABEL),
          );
          expect(
            label.component.options
              .filter((option) => option.default)
              .map((option) => option.value),
          ).toEqual(
            label.component.custom_id === "categories"
              ? ["HighEndDuty"]
              : ["Mana"],
          );
        }
      }
      const page = buildSubscriptionPage(
        store,
        scopeA,
        0,
        "reset",
        "session",
        language,
      );
      expect(page.payload.content).toContain(
        language.messages.pager.selectReset.trim(),
      );
      expect(page.payload.content.length).toBeLessThanOrEqual(2000);
      const select = page.payload.components[0]!.toJSON().components[0];
      if (select?.type !== ComponentType.StringSelect)
        throw new Error("expected select");
      expect(select.options.at(-1)).toMatchObject({
        label: language.messages.pager.all,
        value: "all",
      });
      expect(
        select.options.every(
          (option) => (option.description?.length ?? 0) <= 100,
        ),
      ).toBe(true);
      expect(new Set(Object.keys(language.categories))).toEqual(
        new Set(CATEGORIES),
      );
      expect(new Set(Object.keys(language.tags))).toEqual(
        new Set(RECRUITMENT_TAGS),
      );
    } finally {
      store.close();
    }
  },
);

test.each([...LANGUAGES])(
  "%s lists five long patterns with complete IDs and creator mentions",
  (code) => {
    const store = new SubscriptionStore(":memory:");
    try {
      for (let index = 0; index < 5; index++) {
        const result = store.addSubscription(
          scopeA,
          `${index}-` + "x".repeat(998),
          "1234567890123456789",
          {
            dataCentres: Object.keys(DATA_CENTRE_LABEL),
            categories: [...CATEGORIES],
          },
        );
        expect(result.ok).toBe(true);
      }
      const page = buildSubscriptionPage(
        store,
        scopeA,
        0,
        "list",
        "session",
        LOCALES[code],
      );
      expect(page.subscriptions).toHaveLength(5);
      expect(page.payload.content.length).toBeLessThanOrEqual(2000);
      for (const sub of page.subscriptions) {
        expect(page.payload.content).toContain(
          `${sub.keyword.slice(0, 50)}...\n`,
        );
        expect(page.payload.content).toContain(sub.id);
        expect(page.payload.content).toContain(`<@${sub.userId}>`);
        expect(store.getSubscription(scopeA, sub.id)?.keyword).toBe(
          sub.keyword,
        );
      }
    } finally {
      store.close();
    }
  },
);

test.each([
  ["x".repeat(50), "x".repeat(50)],
  ["x".repeat(51), "x".repeat(50) + "..."],
  ["x".repeat(49) + "*xyz", "x".repeat(49) + "\\*..."],
  ["x".repeat(49) + "😀xyz", "x".repeat(49) + "😀..."],
])(
  "list shows the first 50 characters of %s before Markdown escaping",
  (keyword, expected) => {
    const store = new SubscriptionStore(":memory:");
    try {
      const result = store.addSubscription(scopeA, keyword, "user");
      expect(result.ok).toBe(true);
      const page = buildSubscriptionPage(
        store,
        scopeA,
        0,
        "list",
        "session",
        LOCALES.FR,
      );
      expect(page.payload.content).toContain(`\n\n1. ${expected}\n`);
    } finally {
      store.close();
    }
  },
);

test.each([...LANGUAGES])(
  "%s output remains bounded after long translations and Markdown escaping",
  (code) => {
    const language = LOCALES[code];
    const long = "😀**".repeat(2000);
    const notification = buildNotification(
      listing({
        duty: long,
        description: long,
        creator: long,
        world: long,
        dataCentre: long,
        minIlvl: long,
        expires: long,
        slots: Array.from({ length: 40 }, () => ({
          filled: true,
          role: ["tank"],
          acceptedJobs: ["PLD"],
        })),
      }),
      [long],
      1_800_000_000_000,
      language,
    );
    const embed = notification.payload.embeds[0]!.toJSON();
    expect(embed.title!.length).toBeLessThanOrEqual(256);
    expect(embed.fields!.every((field) => field.value.length <= 1024)).toBe(
      true,
    );
    const size =
      embed.title!.length +
      embed.footer!.text.length +
      embed.fields!.reduce(
        (sum, field) => sum + field.name.length + field.value.length,
        0,
      );
    expect(size).toBeLessThanOrEqual(6000);
    expect(notification.payload.allowedMentions.parse).toEqual([]);
  },
);

test.each([...LANGUAGES])(
  "%s renders permissions, cleanup results and presence in the selected language",
  async (code) => {
    const language = LOCALES[code];
    const context = getCommandContext(
      { inGuild: () => false } as never,
      language,
    );
    expect(context).toEqual({
      ok: false,
      reason: language.messages.errors.guildOnly,
    });
    const result = formatCleanupResult(
      { removed: 3, failed: 1, unlinked: 2, fetchFailed: true },
      language,
    );
    expect(result).toContain(
      language.messages.cleanup.result({ removed: 3, failed: 1 }),
    );
    expect(result).toContain(language.messages.cleanup.fetchFailed);
    expect(result).toContain(language.messages.cleanup.unlinked({ count: 2 }));
    const states: PresenceData[] = [];
    const client = fakeClient([fakeChannel().channel]);
    Object.assign(client, {
      user: { setPresence: (presence: PresenceData) => states.push(presence) },
    });
    const runner = createTaskRunner(client, "*/5 * * * *", language);
    try {
      await runner.run("fetching", async () => {});
      expect(states[1]!.activities![0]).toMatchObject({
        name: language.messages.presence.fetching,
        type: ActivityType.Playing,
      });
    } finally {
      await runner.stop();
    }
  },
);

test("subscription validation returns stable error codes independent of language", () => {
  const store = new SubscriptionStore(":memory:");
  try {
    expect(getKeywordError("")).toBe("PATTERN_LENGTH");
    expect(getKeywordError("[")).toBe("INVALID_PATTERN");
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        categories: ["unknown" as never],
      }),
    ).toEqual({ ok: false, errorCode: "INVALID_CATEGORY" });
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        dataCentres: ["unknown"],
      }),
    ).toEqual({ ok: false, errorCode: "INVALID_DATA_CENTRE" });
  } finally {
    store.close();
  }
});

test.each(["", " chs ", "DE", "FR", "JA", "KO", "invalid"])(
  "startup LANGUAGE=%s controls default rendering and command registration",
  async (value) => {
    const modulePath = new URL("../src/locales/index.ts", import.meta.url).href;
    const commandPath = new URL("../src/commands/subscribe.ts", import.meta.url)
      .href;
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `const { locale } = await import(${JSON.stringify(modulePath)}); const { data } = await import(${JSON.stringify(commandPath)}); console.log(JSON.stringify({ language: locale.language, description: data.toJSON().description }));`,
      ],
      {
        env: { ...process.env, LANGUAGE: value },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const language = LOCALES[resolveLanguage(value)];
    expect(JSON.parse(stdout)).toEqual({
      language: language.language,
      description: language.messages.commands.subscribe,
    });
  },
  15_000,
);
