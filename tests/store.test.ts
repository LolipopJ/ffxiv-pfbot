import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";

import { SubscriptionStore } from "../src/services/store";
import {
  removeTemporaryDirectory,
  scopeA,
  scopeB,
  temporaryDirectory,
} from "./helpers";

const stores: SubscriptionStore[] = [];
const directories: string[] = [];
function open(filename = ":memory:") {
  const store = new SubscriptionStore(filename);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    removeTemporaryDirectory(directory);
});

describe("SQLite subscription scope", () => {
  test("isolates reads, pagination, deletes and deliveries by channel and guild", () => {
    const store = open();
    const a = store.addSubscription(scopeA, ".*", "A");
    const b = store.addSubscription(scopeB, ".*", "B");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("setup failed");
    expect(store.getSubscriptions(scopeA).map((sub) => sub.id)).toEqual([
      a.sub.id,
    ]);
    expect(store.getSubscriptionsPage(scopeA).total).toBe(1);
    expect(store.removeSubscription(scopeA, b.sub.id)).toBe(false);
    expect(
      store.removeSubscription({ ...scopeA, guildId: "other-guild" }, a.sub.id),
    ).toBe(false);
    expect(
      store.getSubscriptions({ ...scopeA, guildId: "other-guild" }),
    ).toEqual([]);
    store.saveDelivery(scopeA, "123", {
      messageId: "msg-A",
      payloadHash: "hash",
    });
    expect(store.getDelivery(scopeB, "123")).toBeNull();
    expect(
      store.getDelivery({ ...scopeA, guildId: "other-guild" }, "123"),
    ).toBeNull();
    expect(store.removeSubscription(scopeA, a.sub.id)).toBe(true);
  });

  test("enforces duplicate and regex constraints without deleting other data", () => {
    const store = open();
    expect(store.addSubscription(scopeA, "Ultimate", "user").ok).toBe(true);
    expect(store.addSubscription(scopeA, "Ultimate", "another-user").ok).toBe(
      false,
    );
    expect(store.addSubscription(scopeB, "Ultimate", "user").ok).toBe(true);
    expect(store.addSubscription(scopeA, "[", "user").ok).toBe(false);
    expect(store.addSubscription(scopeA, "x".repeat(1001), "user").ok).toBe(
      false,
    );
    expect(store.getSubscriptions(scopeA)).toHaveLength(1);
    expect(() =>
      store.getSubscriptions({ guildId: "", channelId: "" }),
    ).toThrow();
  });

  test("subscription and message state survive database reopening", () => {
    const directory = temporaryDirectory();
    directories.push(directory);
    const filename = join(directory, "state.sqlite");
    const first = open(filename);
    first.addSubscription(scopeA, ".*", "user");
    first.saveDelivery(scopeA, "123", {
      messageId: "message-1",
      payloadHash: "hash",
    });
    first.close();
    const second = open(filename);
    expect(second.getSubscriptions(scopeA)).toHaveLength(1);
    expect(second.getDelivery(scopeA, "123")).toEqual({
      messageId: "message-1",
      payloadHash: "hash",
    });
  });

  test("concurrent SQLite writers do not lose updates", async () => {
    const directory = temporaryDirectory();
    directories.push(directory);
    const filename = join(directory, "concurrent.sqlite");
    const store = open(filename);
    const modulePath = new URL("../src/services/store.ts", import.meta.url)
      .href;
    const children = Array.from({ length: 4 }, (_, worker) =>
      Bun.spawn(
        [
          process.execPath,
          "--eval",
          `import { SubscriptionStore } from ${JSON.stringify(modulePath)};
       const store = new SubscriptionStore(${JSON.stringify(filename)});
       for (let i = 0; i < 20; i++) store.addSubscription({guildId: 'guild-A', channelId: 'channel-A'}, 'worker-${worker}-' + i, 'user');
       store.close();`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      ),
    );
    for (const child of children) {
      const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
    }
    expect(store.getSubscriptions(scopeA)).toHaveLength(80);
  }, 15_000);
});
