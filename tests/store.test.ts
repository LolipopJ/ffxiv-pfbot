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
  test("expired listing markers survive reopening and removing delivery records", () => {
    const directory = temporaryDirectory();
    directories.push(directory);
    const filename = join(directory, "expired-listings.sqlite");
    const first = open(filename);
    first.saveDelivery(scopeA, "123", {
      messageId: "message",
      payloadHash: "hash",
      updatedAt: 1_799_999_940_000,
      expiresAt: 1_800_000_000_000,
    });
    first.markListingExpired("123", 1_800_000_000_000, 1_800_000_000_000);
    first.markListingExpired("123", 1_800_000_000_001, 1_800_000_000_001);
    expect(first.getExpiredListingIds()).toEqual(["123"]);
    first.removeDelivery(scopeA, "123");
    first.close();
    const reopened = open(filename);
    expect(reopened.getMonitorDeliveries()).toEqual([]);
    expect(reopened.getExpiredListingIds()).toEqual(["123"]);
    expect(reopened.getExpiredListings()).toEqual([
      {
        listingId: "123",
        createdAt: 1_800_000_000_000,
        updatedAt: 1_800_000_000_001,
        expiresAt: 1_800_000_000_001,
      },
    ]);
    reopened.removeExpiredListing("123");
    expect(reopened.getExpiredListingIds()).toEqual([]);
  });

  test("delivery updates preserve creation time and replace observation time and deadline", () => {
    const store = open();
    const otherGuild = { ...scopeA, guildId: "other-guild" };
    for (const scope of [scopeA, scopeB, otherGuild]) {
      store.saveDelivery(scope, "123", {
        messageId: "message",
        payloadHash: "hash",
        updatedAt: 1_799_999_940_000,
        expiresAt: 1_800_000_000_000,
      });
    }
    store.saveDelivery(scopeA, "123", {
      messageId: "updated",
      payloadHash: "updated",
      updatedAt: 1_800_000_000_000,
      expiresAt: 1_800_000_060_000,
    });
    expect(store.getDelivery(scopeA, "123")).toEqual({
      messageId: "updated",
      payloadHash: "updated",
      createdAt: 1_799_999_940_000,
      updatedAt: 1_800_000_000_000,
      expiresAt: 1_800_000_060_000,
    });
    expect(store.getMonitorDeliveries()).toHaveLength(3);
    expect(store.removeDelivery(scopeA, "123")).toBe(true);
    expect(store.removeDelivery(scopeA, "123")).toBe(false);
    expect(store.getDelivery(scopeB, "123")).not.toBeNull();
    expect(store.getDelivery(otherGuild, "123")).not.toBeNull();
    expect(store.getMonitorDeliveries()).toHaveLength(2);
  });

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
      updatedAt: 1_799_999_940_000,
      expiresAt: 1_800_000_000_000,
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
      updatedAt: 1_799_999_940_000,
      expiresAt: 1_800_000_000_000,
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
      createdAt: 1_799_999_940_000,
      updatedAt: 1_799_999_940_000,
      expiresAt: 1_800_000_000_000,
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
