import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { logger } from "../src/utils/logger";

afterEach(() => mock.restore());

test("logs use a common UTC, level and module prefix with readable context", () => {
  const info = spyOn(console, "log").mockImplementation(() => {});
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  logger.info("监控", "已发送招募消息", { channelId: "123", listingId: "456" });
  logger.warn("抓取", "页面无法解析", { reason: "bad\npage" });
  expect(info.mock.calls[0]?.[0]).toMatch(
    /^\[\d{4}-\d{2}-\d{2}T.*Z\] \[ℹ️\] \[监控\] 已发送招募消息 /,
  );
  expect(info.mock.calls[0]?.[0]).toContain('"channelId":"123"');
  expect(warn.mock.calls[0]?.[0]).toContain(
    '[⚠️] [抓取] 页面无法解析 {"reason":"bad\\npage"}',
  );
});

test("error logs retain the original error and its stack", () => {
  const output = spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("offline");
  logger.error("监控", "投递失败", { channelId: "123", error });
  expect(output.mock.calls[0]?.[0]).toContain(
    '[❌] [监控] 投递失败 {"channelId":"123"}',
  );
  expect(output.mock.calls[0]?.[1]).toBe(error);
});
