import { Database } from "bun:sqlite";
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
    first.addSubscription(scopeA, ".*", "user", {
      dataCentres: ["Mana", "Light"],
      categories: ["Trials", "HighEndDuty"],
    });
    first.saveDelivery(scopeA, "123", {
      messageId: "message-1",
      payloadHash: "hash",
    });
    first.close();
    const second = open(filename);
    expect(second.getSubscriptions(scopeA)).toHaveLength(1);
    expect(second.getSubscriptions(scopeA)[0]).toMatchObject({
      dataCentres: ["Light", "Mana"],
      categories: ["HighEndDuty", "Trials"],
    });
    expect(second.getDelivery(scopeA, "123")).toEqual({
      messageId: "message-1",
      payloadHash: "hash",
    });
  });

  test("filter sets are normalized for uniqueness and unknown constants are rejected", () => {
    const store = open();
    const filters = {
      dataCentres: ["Mana", "Light", "Mana"],
      categories: ["Trials", "HighEndDuty"] as const,
    };
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        ...filters,
        categories: [...filters.categories],
      }).ok,
    ).toBe(true);
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        dataCentres: ["Light", "Mana"],
        categories: ["HighEndDuty", "Trials"],
      }).ok,
    ).toBe(false);
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        dataCentres: ["Gaia"],
      }).ok,
    ).toBe(true);
    expect(store.addSubscription(scopeA, "Ultimate", "user").ok).toBe(true);
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        dataCentres: ["toString"],
      }).ok,
    ).toBe(false);
    expect(
      store.addSubscription(scopeA, "Ultimate", "user", {
        categories: ["invalid" as never],
      }).ok,
    ).toBe(false);
    expect(store.getSubscriptions(scopeA)).toHaveLength(3);
    expect(store.getSubscriptionsPage(scopeA).subscriptions).toEqual(
      store.getSubscriptions(scopeA),
    );
    expect(
      store
        .getMonitorSubscriptions()
        .every(
          (sub) =>
            Array.isArray(sub.dataCentres) && Array.isArray(sub.categories),
        ),
    ).toBe(true);
  });

  test("legacy databases migrate without losing subscriptions or delivery state", () => {
    const directory = temporaryDirectory();
    directories.push(directory);
    const filename = join(directory, "legacy.sqlite");
    const legacy = new Database(filename);
    legacy.run(`
      CREATE TABLE subscriptions (
        id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        keyword TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE (guild_id, channel_id, keyword)
      );
      INSERT INTO subscriptions VALUES ('legacy-id', 'guild-A', 'channel-A', 'Ultimate', 'user', '2026-09-01T00:00:00.000Z');
      CREATE TABLE deliveries (
        guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, listing_id TEXT NOT NULL,
        message_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id, listing_id)
      );
      INSERT INTO deliveries VALUES ('guild-A', 'channel-A', '123', 'message-1', 'hash');
    `);
    legacy.close();
    const migrated = open(filename);
    expect(migrated.getSubscriptions(scopeA)).toEqual([
      {
        ...scopeA,
        id: "legacy-id",
        keyword: "Ultimate",
        userId: "user",
        createdAt: "2026-09-01T00:00:00.000Z",
        dataCentres: [],
        categories: [],
      },
    ]);
    expect(migrated.getDelivery(scopeA, "123")).toEqual({
      messageId: "message-1",
      payloadHash: "hash",
    });
    expect(migrated.addSubscription(scopeA, "Ultimate", "user").ok).toBe(false);
    expect(
      migrated.addSubscription(scopeA, "Ultimate", "user", {
        dataCentres: ["Mana"],
      }).ok,
    ).toBe(true);
    migrated.close();
    expect(open(filename).getSubscriptions(scopeA)).toHaveLength(2);
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
