import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { fileURLToPath } from "url";

import { locale, LOCALES } from "../src/locales";
import { LANGUAGES, resolveLanguage } from "../src/locales/utils/config";
import { createLogger, logger } from "../src/utils/logger";

afterEach(() => mock.restore());

test("logs use a common UTC, level and module prefix with readable context", () => {
  const info = spyOn(console, "log").mockImplementation(() => {});
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  logger.info("monitor", "listingSent", { channelId: "123", listingId: "456" });
  logger.warn("listing", "expiryUnknown", { reason: "bad\npage" });
  expect(info.mock.calls[0]?.[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*Z\] \[ℹ️\] /);
  const messages = locale.messages.logs;
  expect(info.mock.calls[0]?.[0]).toContain(
    `[${messages.modules.monitor}] ${messages.events.listingSent} {"channelId":"123","listingId":"456"}`,
  );
  expect(warn.mock.calls[0]?.[0]).toContain(
    `[⚠️] [${messages.modules.listing}] ${messages.events.expiryUnknown} {"reason":"bad\\npage"}`,
  );
});

test.each([...LANGUAGES])(
  "%s localizes all log levels and keeps context and original errors",
  (code) => {
    const info = spyOn(console, "log").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const output = spyOn(console, "error").mockImplementation(() => {});
    const language = LOCALES[code];
    const localized = createLogger(language);
    const messages = language.messages.logs;
    const error = new Error("offline");
    localized.info("database", "databaseOpened", { filename: "data.db" });
    localized.warn("presence", "presenceFailed", { error });
    localized.error("monitor", "deliveryFailed", { channelId: "123", error });
    expect(info.mock.calls[0]?.[0]).toContain(
      `[ℹ️] [${messages.modules.database}] ${messages.events.databaseOpened} {"filename":"data.db"}`,
    );
    expect(warn.mock.calls[0]?.[0]).toContain(
      `[⚠️] [${messages.modules.presence}] ${messages.events.presenceFailed}`,
    );
    expect(warn.mock.calls[0]?.[1]).toBe(error);
    expect(output.mock.calls[0]?.[0]).toContain(
      `[❌] [${messages.modules.monitor}] ${messages.events.deliveryFailed} {"channelId":"123"}`,
    );
    expect(output.mock.calls[0]?.[1]).toBe(error);
    expect(output.mock.calls[0]?.[0]).not.toContain('"error"');
    expect(error.message).toBe("offline");
    if (code !== "EN") {
      expect(messages.modules.monitor).not.toBe(
        LOCALES.EN.messages.logs.modules.monitor,
      );
      expect(messages.events.deliveryFailed).not.toBe(
        LOCALES.EN.messages.logs.events.deliveryFailed,
      );
    }
  },
);

test.each(["", " en ", " chs ", "DE", "FR", "JA", "KO", "invalid"])(
  "startup LANGUAGE=%s localizes logs before safely failing without a token",
  async (value) => {
    const entryPath = fileURLToPath(
      new URL("../src/index.ts", import.meta.url),
    );
    const child = Bun.spawn([process.execPath, "--no-env-file", entryPath], {
      env: { ...process.env, LANGUAGE: value, DISCORD_BOT_TOKEN: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const language = LOCALES[resolveLanguage(value)];
    const messages = language.messages.logs;
    expect(code).toBe(1);
    expect(stdout).toContain(
      `[${messages.modules.startup}] ${messages.events.languageConfigured} {"language":"${language.language}"}`,
    );
    expect(stderr).toContain(
      `[${messages.modules.startup}] ${messages.events.missingToken}`,
    );
    expect(stdout).not.toContain(messages.events.connecting);
    if (value === "invalid") {
      expect(stderr).toContain(
        `[${messages.modules.language}] ${messages.events.unsupportedLanguage}`,
      );
      expect(stderr).toContain('"value":"invalid"');
      expect(stderr).toContain('"fallback":"EN"');
      expect(stderr).toContain(JSON.stringify(LANGUAGES));
      expect(stderr.split(messages.events.unsupportedLanguage)).toHaveLength(2);
    } else {
      expect(stderr).not.toContain(messages.events.unsupportedLanguage);
    }
  },
  15_000,
);
