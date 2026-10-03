import {
  afterEach,
  beforeEach,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from "bun:test";
import { ActivityType, type PresenceData } from "discord.js";

import { CLEANUP_INTERVAL_MS, createCleanup } from "../src/services/cleanup";
import { createMonitor } from "../src/services/monitor";
import { SubscriptionStore } from "../src/services/store";
import { createTaskRunner, getTaskRunner } from "../src/services/tasks";
import { logger } from "../src/utils/logger";
import { fakeChannel, fakeClient, listing, scopeA, scopeB } from "./helpers";

const stores: SubscriptionStore[] = [];
const cleanups: ReturnType<typeof createCleanup>[] = [];
beforeEach(() => {
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup.stop();
  for (const store of stores.splice(0)) store.close();
  jest.useRealTimers();
  mock.restore();
});

function setup(now: () => number = Date.now) {
  const store = new SubscriptionStore(":memory:");
  stores.push(store);
  const a = fakeChannel(scopeA);
  const b = fakeChannel(scopeB);
  const client = fakeClient([a.channel, b.channel]);
  const states: string[] = [];
  Object.assign(client, {
    user: {
      setPresence: (presence: PresenceData) =>
        states.push(presence.activities![0]!.name!),
    },
  });
  const fetcher = mock(async () => [listing()]);
  const cleanup = createCleanup(client, store, fetcher, now);
  const monitor = createMonitor(client, store, fetcher, now, cleanup);
  cleanups.push(cleanup);
  return { store, a, b, client, fetcher, monitor, cleanup, states };
}

test("each monitor run cleans disappeared messages in all channels using one website fetch", async () => {
  const { store, a, b, fetcher, monitor, states } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  store.addSubscription(scopeB, "Ultimate", "user");
  await monitor.check();
  fetcher.mockResolvedValue([]);
  fetcher.mockClear();
  await monitor.check();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(a.deletes).toEqual(["message-1"]);
  expect(b.deletes).toEqual(["message-1"]);
  expect(store.getMonitorDeliveries()).toEqual([]);
  expect(store.getMonitorSubscriptions()).toHaveLength(2);
  expect(states.slice(-4)).toEqual([
    "获取并处理招募信息中...",
    expect.stringContaining("下次执行："),
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
});

test("checks stay coalesced and idle waits until automatic cleanup finishes", async () => {
  const { store, a, fetcher, monitor } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  await monitor.check();
  fetcher.mockResolvedValue([]);
  fetcher.mockClear();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const remove = a.channel.messages.delete.bind(a.channel.messages);
  spyOn(a.channel.messages, "delete").mockImplementation(async (id) => {
    entered.resolve();
    await release.promise;
    return remove(id);
  });
  const check = monitor.check();
  await entered.promise;
  let idle = false;
  const drained = monitor.idle().then(() => {
    idle = true;
  });
  try {
    expect(monitor.check()).toBe(check);
    await Promise.resolve();
    expect(idle).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    release.resolve();
    await Promise.all([check, drained]);
  }
  expect(store.getMonitorDeliveries()).toEqual([]);
});

test("post-monitor cleanup does not renew a deadline crossed during sending", async () => {
  let time = 1_800_000_000_000;
  const { store, a, fetcher, monitor } = setup(() => time);
  store.addSubscription(scopeA, "Ultimate", "user");
  const expiresAt = time + 1000;
  fetcher.mockResolvedValue([listing({ expires: "in a second" })]);
  a.control.beforeSend = async () => {
    time = expiresAt;
  };
  await monitor.check();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(a.sends).toHaveLength(1);
  expect(a.deletes).toEqual(["message-1"]);
  expect(store.getMonitorDeliveries()).toEqual([]);
  expect(store.getExpiredListings()).toMatchObject([
    { listingId: "123", expiresAt },
  ]);
});

test("an idle or unexpectedly failed monitor still executes cleanup without refetching", async () => {
  const { store, a, fetcher, monitor, states } = setup();
  await monitor.check();
  expect(fetcher).not.toHaveBeenCalled();
  expect(states.at(-2)).toBe("清理过期的招募信息中...");
  store.saveDelivery(scopeA, "expired", {
    messageId: "old-message",
    payloadHash: "old",
    updatedAt: 0,
    expiresAt: 0,
  });
  spyOn(store, "getMonitorSubscriptions").mockImplementationOnce(() => {
    throw new Error("unexpected monitor failure");
  });
  await monitor.check();
  expect(fetcher).not.toHaveBeenCalled();
  expect(a.deletes).toEqual(["old-message"]);
  expect(store.getMonitorDeliveries()).toEqual([]);
});

test("cleanup exceptions leave the next monitor run usable", async () => {
  const { store, a, fetcher, monitor, cleanup } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  await monitor.check();
  fetcher.mockResolvedValue([]);
  spyOn(cleanup, "clearAfterMonitor").mockRejectedValueOnce(
    new Error("offline"),
  );
  const errors = spyOn(logger, "error");
  await monitor.check();
  expect(store.getMonitorDeliveries()).toHaveLength(1);
  expect(errors).toHaveBeenCalledWith(
    "清理",
    "监控后的自动清理异常，下次清理重试",
    {
      error: expect.any(Error),
    },
  );
  await monitor.check();
  expect(a.deletes).toEqual(["message-1"]);
  expect(store.getMonitorDeliveries()).toEqual([]);
});

test("shutdown drains the cleanup queued behind an in-flight monitor", async () => {
  const { store, a, client, fetcher, monitor, cleanup } = setup();
  store.saveDelivery(scopeA, "old", {
    messageId: "old-message",
    payloadHash: "old",
    updatedAt: 0,
    expiresAt: Date.now() + CLEANUP_INTERVAL_MS,
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  fetcher.mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    return [];
  });
  const check = monitor.check();
  await entered.promise;
  const stopped = Promise.all([
    monitor.idle(),
    cleanup.stop(),
    getTaskRunner(client).stop(),
  ]);
  release.resolve();
  await Promise.all([check, stopped]);
  expect(a.deletes).toEqual(["old-message"]);
  expect(store.getMonitorDeliveries()).toEqual([]);
});

test("post-monitor cleanup restarts the hourly fallback countdown", async () => {
  jest.useFakeTimers();
  const { store, monitor, cleanup } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  cleanup.start();
  const completed = spyOn(logger, "info");
  const count = () =>
    completed.mock.calls.filter(([, message]) => message === "清理完成").length;
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS / 2);
  await monitor.check();
  expect(count()).toBe(1);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS - 1);
  expect(count()).toBe(1);
  jest.advanceTimersByTime(1);
  await cleanup.idle();
  expect(count()).toBe(2);
});

test("manual clear cleans only its channel", async () => {
  const { store, a, b, fetcher, monitor, cleanup, states } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  store.addSubscription(scopeB, "Ultimate", "user");
  await monitor.check();
  fetcher.mockResolvedValue([]);
  expect(a.deletes).toEqual([]);
  expect(b.deletes).toEqual([]);
  expect(store.getMonitorDeliveries()).toHaveLength(2);
  expect(await cleanup.clear(scopeA)).toMatchObject({ removed: 1, failed: 0 });
  expect(b.deletes).toEqual([]);
  expect(store.getChannelDeliveries(scopeB)).toHaveLength(1);
  expect(await cleanup.clear()).toMatchObject({ removed: 1, failed: 0 });
  expect(states).toContain("获取并处理招募信息中...");
  expect(states.slice(-2)).toEqual([
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
});

test.each([
  { updated: "now", removed: 0 },
  { updated: "9 minutes ago", removed: 0 },
  { updated: "10 minutes ago", removed: 0 },
  { updated: "11 minutes ago", removed: 1 },
  { updated: "23 minutes ago", removed: 1 },
  { updated: "59 minutes ago", removed: 1 },
  { updated: "an hour ago", removed: 1 },
  { updated: "", removed: 0 },
  { updated: "unknown", removed: 0 },
  { updated: "in 20 minutes", removed: 0 },
])(
  "manual cleanup treats $updated as stale only after ten minutes and respects channel scope",
  async ({ updated, removed }) => {
    const { store, a, b, fetcher, monitor, cleanup } = setup();
    store.addSubscription(scopeA, "Ultimate", "user");
    store.addSubscription(scopeB, "Ultimate", "user");
    await monitor.check();
    fetcher.mockResolvedValue([listing({ updated })]);
    expect(await cleanup.clear(scopeA)).toMatchObject({ removed, failed: 0 });
    expect(a.deletes).toEqual(removed ? ["message-1"] : []);
    expect(b.deletes).toEqual([]);
    expect(store.getChannelDeliveries(scopeA)).toHaveLength(1 - removed);
    expect(store.getChannelDeliveries(scopeB)).toHaveLength(1);
    expect(store.getMonitorSubscriptions()).toHaveLength(2);
  },
);

test.each([false, true])(
  "monitor cleanup suppresses stale entries until the website updates them (previous delivery: %s)",
  async (previousDelivery) => {
    const { store, a, fetcher, monitor } = setup();
    store.addSubscription(scopeA, "Ultimate", "user");
    if (previousDelivery) await monitor.check();
    fetcher.mockResolvedValue([
      listing({ updated: "23 minutes ago", description: "Changed" }),
    ]);
    fetcher.mockClear();
    await monitor.check();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.sends).toHaveLength(previousDelivery ? 1 : 0);
    expect(a.edits).toHaveLength(0);
    expect(a.deletes).toEqual(previousDelivery ? ["message-1"] : []);
    expect(store.getMonitorDeliveries()).toEqual([]);
    await monitor.check();
    expect(a.sends).toHaveLength(previousDelivery ? 1 : 0);
    expect(a.edits).toHaveLength(0);
    fetcher.mockResolvedValue([listing({ updated: "now" })]);
    await monitor.check();
    expect(a.sends).toHaveLength(previousDelivery ? 2 : 1);
    expect(store.getMonitorDeliveries()).toHaveLength(1);
    expect(store.getExpiredListingIds()).toEqual([]);
  },
);

test("stale cleanup failures remain retryable when the next website fetch fails", async () => {
  const { store, a, fetcher, monitor, cleanup } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  await monitor.check();
  fetcher.mockResolvedValue([
    listing({ updated: "11 minutes ago", expires: "unknown" }),
  ]);
  a.control.deleteError = Object.assign(new Error("forbidden"), {
    code: 50013,
  });
  expect(await cleanup.clear(scopeA)).toMatchObject({ removed: 0, failed: 1 });
  expect(store.getMonitorDeliveries()).toHaveLength(1);
  expect(store.getExpiredListingIds()).toEqual(["123"]);
  a.control.deleteError = undefined;
  fetcher.mockRejectedValue(new Error("offline"));
  expect(await cleanup.clear(scopeA)).toMatchObject({
    removed: 1,
    failed: 0,
    fetchFailed: true,
  });
  expect(a.deletes).toEqual(["message-1"]);
  expect(store.getMonitorDeliveries()).toEqual([]);
  expect(store.getSubscriptions(scopeA)).toHaveLength(1);
});

test("targeted reset ignores expiry and the website, handles shared messages and preserves other scopes", async () => {
  const { store, a, b, fetcher, monitor, cleanup, states } = setup();
  const first = store.addSubscription(scopeA, "Ultimate", "user");
  const second = store.addSubscription(scopeA, "Practice", "user");
  store.addSubscription(scopeB, "Ultimate", "user");
  if (!first.ok || !second.ok) throw new Error("setup failed");
  fetcher.mockResolvedValue([
    listing(),
    listing({ id: "other", rawText: "Practice" }),
  ]);
  await monitor.check();
  expect(a.sends).toHaveLength(2);
  expect(store.getDeliverySubscriptionIds(scopeA, "123").sort()).toEqual(
    [first.sub.id, second.sub.id].sort(),
  );
  fetcher.mockRejectedValue(new Error("offline"));
  fetcher.mockClear();
  expect(await cleanup.reset(scopeA, first.sub.id)).toMatchObject({
    removed: 1,
    failed: 0,
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(a.deletes).toEqual(["message-1"]);
  expect(b.deletes).toEqual([]);
  expect(store.getDelivery(scopeA, "other")).not.toBeNull();
  expect(store.getDeliverySubscriptionIds(scopeA, "123")).toEqual([]);
  expect(store.getSubscriptions(scopeA)).toHaveLength(2);
  expect(store.getExpiredListingIds()).toEqual([]);
  expect(states.slice(-2)).toEqual([
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
});

test("reset all includes legacy and cancelled subscriptions and preserves global suppression", async () => {
  const { store, a, cleanup } = setup();
  for (const scope of [scopeA, scopeB, { ...scopeA, guildId: "other-guild" }]) {
    store.saveDelivery(scope, "123", {
      messageId: "legacy",
      payloadHash: "old",
      updatedAt: 0,
      expiresAt: Date.now() + 3_600_000,
    });
  }
  store.markListingExpired("123", 0, 0);
  expect(await cleanup.reset(scopeA)).toMatchObject({ removed: 1, failed: 0 });
  expect(a.deletes).toEqual(["legacy"]);
  expect(store.getMonitorDeliveries()).toHaveLength(2);
  expect(store.getExpiredListingIds()).toEqual(["123"]);
});

test("reset rejects foreign subscriptions and reports unlinked legacy records", async () => {
  const { store, cleanup } = setup();
  const own = store.addSubscription(scopeA, "Ultimate", "user");
  const foreign = store.addSubscription(scopeB, "Ultimate", "user");
  if (!own.ok || !foreign.ok) throw new Error("setup failed");
  store.saveDelivery(scopeA, "legacy", {
    messageId: "legacy",
    payloadHash: "old",
    updatedAt: 0,
    expiresAt: 0,
  });
  await expect(cleanup.reset(scopeA, foreign.sub.id)).rejects.toThrow(
    "无权操作",
  );
  expect(await cleanup.reset(scopeA, own.sub.id)).toMatchObject({
    removed: 0,
    unlinked: 1,
  });
  expect(store.getChannelDeliveries(scopeA)).toHaveLength(1);
});

test("unchanged legacy messages gain exact subscription links including filters", async () => {
  const { store, a, monitor, cleanup } = setup();
  const matching = store.addSubscription(scopeA, "Ultimate", "user", {
    dataCentres: ["Mana"],
  });
  const other = store.addSubscription(scopeA, "Ultimate", "user", {
    dataCentres: ["Light"],
  });
  if (!matching.ok || !other.ok) throw new Error("setup failed");
  await monitor.check();
  store.setDeliverySubscriptions(scopeA, "123", []);
  await monitor.check();
  expect(a.sends).toHaveLength(1);
  expect(a.edits).toHaveLength(0);
  expect(store.getDeliverySubscriptionIds(scopeA, "123")).toEqual([
    matching.sub.id,
  ]);
  expect(await cleanup.reset(scopeA, other.sub.id)).toMatchObject({
    removed: 0,
  });
  expect(await cleanup.reset(scopeA, matching.sub.id)).toMatchObject({
    removed: 1,
  });
});

test("reset failures remain retryable and already missing messages succeed", async () => {
  const { store, a, monitor, cleanup } = setup();
  const sub = store.addSubscription(scopeA, "Ultimate", "user");
  if (!sub.ok) throw new Error("setup failed");
  await monitor.check();
  a.control.deleteError = Object.assign(new Error("forbidden"), {
    code: 50013,
  });
  expect(await cleanup.reset(scopeA, sub.sub.id)).toMatchObject({
    removed: 0,
    failed: 1,
  });
  expect(store.getDeliverySubscriptionIds(scopeA, "123")).toEqual([sub.sub.id]);
  a.control.deleteError = Object.assign(new Error("missing"), { code: 10008 });
  expect(await cleanup.reset(scopeA, sub.sub.id)).toMatchObject({
    removed: 1,
    failed: 0,
  });
  expect(store.getChannelDeliveries(scopeA)).toHaveLength(0);
  expect(a.messageCache.size).toBe(0);
});

test("monitor and reset serialize so reset deletes an in-flight send and the next check can resend", async () => {
  const { store, a, monitor, cleanup, states } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  a.control.beforeSend = async () => {
    entered.resolve();
    await release.promise;
  };
  const check = monitor.check();
  await entered.promise;
  const reset = cleanup.reset(scopeA);
  try {
    expect(states.at(-1)).toBe("获取并处理招募信息中...");
    expect(a.deletes).toEqual([]);
  } finally {
    release.resolve();
    await Promise.all([check, reset]);
  }
  expect(await reset).toMatchObject({ removed: 1 });
  expect(store.getChannelDeliveries(scopeA)).toEqual([]);
  expect(states.slice(-6)).toEqual([
    "获取并处理招募信息中...",
    expect.stringContaining("下次执行："),
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
  await monitor.check();
  expect(a.sends).toHaveLength(2);
  const first = a.sends[0]!.payload as { nonce: string };
  const second = a.sends[1]!.payload as { nonce: string };
  expect(second.nonce).not.toBe(first.nonce);
});

test("a queued monitor keeps the clearing status until cleanup finishes", async () => {
  const { store, a, monitor, cleanup, states } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  await monitor.check();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const remove = a.channel.messages.delete.bind(a.channel.messages);
  spyOn(a.channel.messages, "delete").mockImplementation(async (id) => {
    entered.resolve();
    await release.promise;
    return remove(id);
  });
  const reset = cleanup.reset(scopeA);
  await entered.promise;
  const count = states.length;
  const check = monitor.check();
  try {
    await Promise.resolve();
    expect(states.length).toBe(count);
    expect(states.at(-1)).toBe("清理过期的招募信息中...");
    expect(a.sends).toHaveLength(1);
  } finally {
    release.resolve();
    await Promise.all([reset, check]);
  }
  expect(await reset).toMatchObject({ removed: 1 });
  expect(a.deletes).toEqual(["message-1"]);
  expect(a.sends).toHaveLength(2);
  expect(states.slice(-6)).toEqual([
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
    "获取并处理招募信息中...",
    expect.stringContaining("下次执行："),
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
});

test("hourly cleanup repeats and both manual modes restart the countdown", async () => {
  jest.useFakeTimers();
  const { store, monitor, cleanup, states } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  await monitor.check();
  cleanup.start();
  cleanup.start();
  const completed = spyOn(logger, "info");
  const count = () =>
    completed.mock.calls.filter(([, message]) => message === "清理完成").length;
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS - 1);
  expect(count()).toBe(0);
  jest.advanceTimersByTime(1);
  await cleanup.idle();
  expect(count()).toBe(1);
  expect(states.slice(-2)).toEqual([
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS);
  await cleanup.idle();
  expect(count()).toBe(2);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS / 2);
  await cleanup.clear(scopeA);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS / 2);
  expect(count()).toBe(3);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS / 2);
  await cleanup.idle();
  expect(count()).toBe(4);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS / 2);
  await cleanup.reset(scopeA);
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS - 1);
  expect(count()).toBe(5);
  jest.advanceTimersByTime(1);
  await cleanup.idle();
  expect(count()).toBe(6);
  await cleanup.stop();
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS * 2);
  expect(count()).toBe(6);
  await expect(cleanup.clear()).rejects.toThrow("已停止");
});

test("targeted reset preserves deduplication for another listing with a lost send response", async () => {
  const { store, a, fetcher, monitor, cleanup } = setup();
  const alpha = store.addSubscription(scopeA, "Alpha", "user");
  store.addSubscription(scopeA, "Beta", "user");
  if (!alpha.ok) throw new Error("setup failed");
  fetcher.mockResolvedValue([
    listing({ id: "alpha", rawText: "Alpha" }),
    listing({ id: "beta", rawText: "Beta" }),
  ]);
  const send = a.channel.send.bind(a.channel);
  const accepted = new Map<string, Awaited<ReturnType<typeof send>>>();
  let lostResponse = false;
  spyOn(a.channel, "send").mockImplementation(async (payload) => {
    if (typeof payload !== "object" || !("nonce" in payload))
      throw new Error("expected nonce");
    const nonce = String(payload.nonce);
    const previous = accepted.get(nonce);
    if (previous) return previous;
    const message = await send(payload);
    accepted.set(nonce, message);
    if (message.id === "message-2" && !lostResponse) {
      lostResponse = true;
      throw new Error("Discord accepted Beta but the response was lost");
    }
    return message;
  });
  await monitor.check();
  expect(a.sends).toHaveLength(2);
  expect(store.getDelivery(scopeA, "beta")).toBeNull();
  expect(await cleanup.reset(scopeA, alpha.sub.id)).toMatchObject({
    removed: 1,
  });
  await monitor.check();
  expect(a.sends).toHaveLength(3);
  expect(store.getDelivery(scopeA, "alpha")?.messageId).toBe("message-3");
  expect(store.getDelivery(scopeA, "beta")?.messageId).toBe("message-2");
});

test("long and overlapping cleanups suspend the timer until all queued work finishes", async () => {
  jest.useFakeTimers();
  const { store, a, monitor, cleanup, states } = setup();
  store.addSubscription(scopeA, "Ultimate", "user");
  await monitor.check();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  spyOn(a.channel.messages, "delete").mockImplementation(async () => {
    entered.resolve();
    await release.promise;
  });
  cleanup.start();
  const reset = cleanup.reset(scopeA);
  await entered.promise;
  const activeCount = states.length;
  const queued = cleanup.clear(scopeA);
  try {
    jest.advanceTimersByTime(CLEANUP_INTERVAL_MS * 3);
    expect(states.length).toBe(activeCount);
    expect(states.at(-1)).toBe("清理过期的招募信息中...");
  } finally {
    release.resolve();
    await Promise.all([reset, queued]);
  }
  const count = states.length;
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS - 1);
  expect(states.length).toBe(count);
  jest.advanceTimersByTime(1);
  await cleanup.idle();
  expect(states.length).toBe(count + 2);
  expect(states.slice(-2)).toEqual([
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
});

test("failed cleanup restarts the timer and shutdown drains queued tasks", async () => {
  jest.useFakeTimers();
  const { cleanup, states } = setup();
  cleanup.start();
  await expect(cleanup.reset(scopeA, "missing")).rejects.toThrow();
  expect(states.slice(-2)).toEqual([
    "清理过期的招募信息中...",
    expect.stringContaining("下次执行："),
  ]);
  const count = states.length;
  jest.advanceTimersByTime(CLEANUP_INTERVAL_MS);
  await cleanup.idle();
  expect(states.length).toBe(count + 2);
  expect(states.at(-1)).toStartWith("下次执行：");
  const result = cleanup.reset(scopeA);
  await cleanup.stop();
  expect(await result).toMatchObject({ removed: 0 });
});

test.each(["fetching", "clearing"] as const)(
  "status text ignores environment values and a failed %s task does not poison the queue",
  async (failedState) => {
    const names = ["IDLE", "FETCHING", "CLEARING", "RESETTING"];
    const old = names.map((name) => process.env[`BOT_STATUS_${name}`]);
    try {
      for (const name of names)
        process.env[`BOT_STATUS_${name}`] = `custom ${name}`;
      const states: PresenceData[] = [];
      const client = fakeClient([]);
      Object.assign(client, {
        user: {
          setPresence: (p: PresenceData) => states.push(p),
        },
      });
      const runner = createTaskRunner(client, "*/5 * * * *");
      await expect(
        runner.run(failedState, async () => {
          throw new Error("failed");
        }),
      ).rejects.toThrow("failed");
      const task = mock(async () => {});
      await runner.run("idle", task);
      await runner.run("clearing", task);
      await runner.run("fetching", task);
      expect(task).toHaveBeenCalledTimes(3);
      await runner.stop();
      await expect(runner.run("fetching", async () => {})).rejects.toThrow(
        "关闭",
      );
      expect(states.map((state) => state.activities![0]!.name)).toEqual([
        expect.stringContaining("下次执行："),
        failedState === "fetching"
          ? "获取并处理招募信息中..."
          : "清理过期的招募信息中...",
        expect.stringContaining("下次执行："),
        expect.stringContaining("下次执行："),
        expect.stringContaining("下次执行："),
        "清理过期的招募信息中...",
        expect.stringContaining("下次执行："),
        "获取并处理招募信息中...",
        expect.stringContaining("下次执行："),
      ]);
      expect(states.map((state) => state.status)).toEqual([
        "online",
        "online",
        "online",
        "online",
        "online",
        "online",
        "online",
        "online",
        "online",
      ]);
      expect(
        states.every(
          (state) => state.activities![0]!.type === ActivityType.Playing,
        ),
      ).toBe(true);
    } finally {
      names.forEach((name, index) => {
        if (old[index] === undefined) delete process.env[`BOT_STATUS_${name}`];
        else process.env[`BOT_STATUS_${name}`] = old[index];
      });
    }
  },
);

test.each([
  {
    tz: "UTC",
    cron: "0 9 * * *",
    now: "2026-10-02T08:59:30Z",
    next: "2026/10/2 09:00:00",
  },
  {
    tz: "Asia/Shanghai",
    cron: "0 9 * * *",
    now: "2026-10-02T08:59:30Z",
    next: "2026/10/3 09:00:00",
  },
  {
    tz: "America/New_York",
    cron: "0 9 * * *",
    now: "2026-10-02T08:59:30Z",
    next: "2026/10/2 09:00:00",
  },
  {
    tz: "UTC",
    cron: "30 9 * * MON-FRI",
    now: "2026-10-02T09:30:00Z",
    next: "2026/10/5 09:30:00",
  },
])(
  "idle status uses $cron in the Bun runtime timezone $tz",
  ({ tz, cron, now, next }) => {
    const oldTimezone = process.env.TZ;
    try {
      process.env.TZ = tz;
      spyOn(Date, "now").mockReturnValue(Date.parse(now));
      const states: PresenceData[] = [];
      const client = fakeClient([]);
      Object.assign(client, {
        user: {
          setPresence: (presence: PresenceData) => states.push(presence),
        },
      });
      createTaskRunner(client, cron);
      expect(states[0]?.activities?.[0]?.name).toBe(`下次执行：${next}`);
    } finally {
      if (oldTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = oldTimezone;
    }
  },
);

test("idle status recalculates the next default cron time after a task crosses midnight", async () => {
  const oldTimezone = process.env.TZ;
  const oldCron = process.env.FETCH_CRON;
  try {
    process.env.TZ = "UTC";
    delete process.env.FETCH_CRON;
    const now = spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-10-02T23:58:30Z"),
    );
    const states: PresenceData[] = [];
    const client = fakeClient([]);
    Object.assign(client, {
      user: { setPresence: (presence: PresenceData) => states.push(presence) },
    });
    const runner = createTaskRunner(client);
    expect(runner.cron).toBe("*/5 * * * *");
    expect(states[0]?.activities?.[0]?.name).toBe(
      "下次执行：2026/10/3 00:00:00",
    );
    await runner.run("fetching", async () => {
      now.mockReturnValue(Date.parse("2026-10-03T00:00:00Z"));
    });
    expect(states.at(-1)?.activities?.[0]?.name).toBe(
      "下次执行：2026/10/3 00:05:00",
    );
    await runner.stop();
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
    if (oldCron === undefined) delete process.env.FETCH_CRON;
    else process.env.FETCH_CRON = oldCron;
  }
});
