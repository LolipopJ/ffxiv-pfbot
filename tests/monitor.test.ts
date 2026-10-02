import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import {
  ChannelType,
  type EmbedBuilder,
  PermissionsBitField,
} from "discord.js";
import { join } from "path";

import { createMonitor } from "../src/services/monitor";
import {
  type SubscriptionFilters,
  SubscriptionStore,
} from "../src/services/store";
import {
  fakeChannel,
  fakeClient,
  listing,
  removeTemporaryDirectory,
  scopeA,
  scopeB,
  temporaryDirectory,
} from "./helpers";

const stores: SubscriptionStore[] = [];
const directories: string[] = [];
function setup(filename = ":memory:", filters: SubscriptionFilters = {}) {
  const store = new SubscriptionStore(filename);
  stores.push(store);
  const channel = fakeChannel();
  const fetcher = mock(async () => [listing()]);
  store.addSubscription(scopeA, "Ultimate", "user", filters);
  return { store, ...channel, fetcher, client: fakeClient([channel.channel]) };
}
afterEach(() => {
  mock.restore();
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    removeTemporaryDirectory(directory);
});

beforeEach(() => {
  spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
});

test.each(["first", "later", "unsubscribed", "inaccessible"])(
  "a deadline crossed during channel fetch suppresses every channel when the old delivery is %s",
  async (owner) => {
    const context = setup();
    const b = fakeChannel(scopeB);
    const client = fakeClient([context.channel, b.channel]);
    context.store.addSubscription(scopeB, "Ultimate", "user");
    if (owner === "unsubscribed") {
      for (const sub of context.store.getSubscriptions(scopeA))
        context.store.removeSubscription(scopeA, sub.id);
    }
    let time = 1_800_000_000_000;
    const expiresAt = time + 1;
    const oldScope = owner === "later" ? scopeB : scopeA;
    context.store.saveDelivery(oldScope, "123", {
      messageId: "old-message",
      payloadHash: "old-hash",
      updatedAt: time - 1000,
      expiresAt,
    });
    context.fetcher.mockResolvedValue([listing({ expires: "unknown" })]);
    spyOn(client.channels, "fetch").mockImplementation(async (id) => {
      time += 2;
      if (id === scopeA.channelId)
        return owner === "inaccessible" ? null : context.channel;
      return b.channel;
    });
    const monitor = createMonitor(
      client,
      context.store,
      context.fetcher,
      () => time,
    );
    await monitor.check();
    expect(context.sends).toHaveLength(0);
    expect(b.sends).toHaveLength(0);
    expect(context.store.getExpiredListings()).toMatchObject([
      { listingId: "123", expiresAt },
    ]);
    expect(context.deletes).toEqual(
      owner === "later" || owner === "inaccessible" ? [] : ["old-message"],
    );
    expect(b.deletes).toEqual(owner === "later" ? ["old-message"] : []);
    expect(context.store.getDelivery(oldScope, "123")?.messageId).toBe(
      owner === "inaccessible" ? "old-message" : undefined,
    );
  },
);

test("expired suppression survives reopening the database after delivery cleanup", async () => {
  const directory = temporaryDirectory();
  directories.push(directory);
  const filename = join(directory, "expired-suppression.sqlite");
  const context = setup(filename);
  let time = 1_800_000_000_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in a minute" }),
  ]);
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  time += 60_000;
  context.fetcher.mockImplementation(async () => [listing({ expires: "now" })]);
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(context.store.getMonitorDeliveries()).toEqual([]);
  expect(context.store.getExpiredListingIds()).toEqual(["123"]);
  expect(context.messageCache.size).toBe(0);
  context.store.close();
  const reopened = new SubscriptionStore(filename);
  stores.push(reopened);
  const restarted = createMonitor(
    context.client,
    reopened,
    context.fetcher,
    () => time,
  );
  await restarted.check();
  expect(context.sends).toHaveLength(1);
  expect(reopened.getMonitorDeliveries()).toEqual([]);
  context.fetcher.mockImplementation(async () => {
    throw new Error("offline");
  });
  await restarted.check();
  expect(reopened.getExpiredListingIds()).toEqual(["123"]);
  context.fetcher.mockImplementation(async () => []);
  await restarted.check();
  expect(reopened.getExpiredListingIds()).toEqual([]);
  // After confirmed disappearance the ID can represent a newly observed recruitment.
  context.fetcher.mockImplementation(async () => [listing()]);
  await restarted.check();
  expect(context.sends).toHaveLength(2);
});

test("website renewal takes precedence over an old deadline crossed during channel fetch", async () => {
  const context = setup();
  const b = fakeChannel(scopeB);
  const client = fakeClient([context.channel, b.channel]);
  context.store.addSubscription(scopeB, "Ultimate", "user");
  let time = 1_800_000_000_000;
  const observedAt = time;
  context.store.saveDelivery(scopeA, "123", {
    messageId: "old-message",
    payloadHash: "old-hash",
    updatedAt: time - 1000,
    expiresAt: time + 1,
  });
  context.fetcher.mockResolvedValue([listing({ expires: "in a minute" })]);
  spyOn(client.channels, "fetch").mockImplementation(async (id) => {
    time += 2;
    return id === scopeA.channelId ? context.channel : b.channel;
  });
  await createMonitor(
    client,
    context.store,
    context.fetcher,
    () => time,
  ).check();
  expect(context.edits).toHaveLength(1);
  expect(b.sends).toHaveLength(1);
  expect(context.store.getExpiredListingIds()).toEqual([]);
  expect(context.store.getDelivery(scopeA, "123")?.expiresAt).toBe(
    observedAt + 60_000,
  );
});

test("a failed edit crossing the deadline records expiry instead of sending a replacement", async () => {
  const context = setup();
  const b = fakeChannel(scopeB);
  const client = fakeClient([context.channel, b.channel]);
  context.store.addSubscription(scopeB, "Ultimate", "user");
  let time = 1_800_000_000_000;
  const expiresAt = time + 1;
  context.store.saveDelivery(scopeA, "123", {
    messageId: "old-message",
    payloadHash: "old-hash",
    updatedAt: time - 1000,
    expiresAt,
  });
  context.fetcher.mockResolvedValue([listing({ expires: "unknown" })]);
  const edit = spyOn(context.channel.messages, "edit").mockImplementation(
    async () => {
      time += 2;
      throw Object.assign(new Error("Unknown Message"), { code: 10008 });
    },
  );
  await createMonitor(
    client,
    context.store,
    context.fetcher,
    () => time,
  ).check();
  expect(edit).toHaveBeenCalledTimes(1);
  expect(context.sends).toHaveLength(0);
  expect(b.sends).toHaveLength(0);
  expect(context.store.getExpiredListings()).toMatchObject([
    { listingId: "123", expiresAt },
  ]);
  expect(context.store.getDelivery(scopeA, "123")).toBeNull();
});

test("expiry is saved before deletion and blocks a newly subscribed channel regardless of scope order", async () => {
  const context = setup();
  context.store.saveDelivery(scopeB, "123", {
    messageId: "old-message",
    payloadHash: "old-hash",
    updatedAt: 1_799_999_940_000,
    expiresAt: 1_800_000_000_000,
  });
  context.fetcher.mockImplementation(async () => [listing({ expires: "now" })]);
  const b = fakeChannel(scopeB);
  const deleteMessage = spyOn(b.channel.messages, "delete").mockImplementation(
    async () => {
      expect(context.store.getExpiredListingIds()).toEqual(["123"]);
      throw new Error("offline");
    },
  );
  const monitor = createMonitor(
    fakeClient([context.channel, b.channel]),
    context.store,
    context.fetcher,
    () => 1_800_000_000_000,
  );
  await monitor.check();
  expect(context.sends).toHaveLength(0);
  expect(deleteMessage).toHaveBeenCalledTimes(1);
  expect(context.store.getDelivery(scopeB, "123")?.messageId).toBe(
    "old-message",
  );
  const restarted = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => 1_800_000_000_000,
  );
  await restarted.check();
  expect(context.sends).toHaveLength(0);
});

test("remaining expiry markers are pruned when there are no subscriptions or deliveries", async () => {
  const context = setup();
  for (const sub of context.store.getSubscriptions(scopeA))
    context.store.removeSubscription(scopeA, sub.id);
  context.store.markListingExpired("123", 1_800_000_000_000, 1_800_000_000_000);
  context.fetcher.mockImplementation(async () => [listing({ expires: "now" })]);
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  expect(context.store.getExpiredListingIds()).toEqual(["123"]);
  context.fetcher.mockImplementation(async () => {
    throw new Error("offline");
  });
  await monitor.check();
  expect(context.store.getExpiredListingIds()).toEqual(["123"]);
  context.fetcher.mockImplementation(async () => []);
  await monitor.check();
  expect(context.store.getExpiredListingIds()).toEqual([]);
  await monitor.check();
  expect(context.fetcher).toHaveBeenCalledTimes(3);
});

test("repeated recruitment lifecycles do not accumulate delivery records, expiry markers or cached messages", async () => {
  const context = setup();
  let time = 1_800_000_000_000;
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  for (let cycle = 0; cycle < 100; cycle++) {
    context.fetcher.mockImplementation(async () => [
      listing({ id: `cycle-${cycle}`, expires: "in a second" }),
    ]);
    await monitor.check();
    expect(context.messageCache.size).toBe(1);
    time += 1000;
    context.fetcher.mockImplementation(async () => [
      listing({ id: `cycle-${cycle}`, expires: "now" }),
    ]);
    await monitor.check();
    expect(context.store.getExpiredListingIds()).toEqual([`cycle-${cycle}`]);
    expect(context.store.getMonitorDeliveries()).toHaveLength(0);
    expect(context.messageCache.size).toBe(0);
    context.fetcher.mockImplementation(async () => []);
    await monitor.check();
    expect(context.store.getExpiredListingIds()).toHaveLength(0);
  }
  expect(context.sends).toHaveLength(100);
  expect(context.deletes).toHaveLength(100);
});

test("disappeared recruitments remove their Discord messages and only their delivery records", async () => {
  const context = setup();
  context.fetcher.mockImplementation(async () => [
    listing(),
    listing({ id: "still-active" }),
  ]);
  const b = fakeChannel(scopeB);
  context.store.addSubscription(scopeB, "Ultimate", "user");
  const monitor = createMonitor(
    fakeClient([context.channel, b.channel]),
    context.store,
    context.fetcher,
  );
  await monitor.check();
  context.fetcher.mockImplementation(async () => [
    listing({ id: "still-active" }),
  ]);
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(b.deletes).toEqual(["message-1"]);
  expect(context.store.getDelivery(scopeA, "123")).toBeNull();
  expect(context.store.getDelivery(scopeB, "123")).toBeNull();
  expect(context.store.getMonitorDeliveries()).toHaveLength(2);
  expect(context.store.getSubscriptions(scopeA)).toHaveLength(1);
  expect(context.sends).toHaveLength(2);
});

test("cleanup continues after the final subscription is cancelled", async () => {
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  for (const sub of context.store.getSubscriptions(scopeA))
    context.store.removeSubscription(scopeA, sub.id);
  await monitor.check();
  expect(context.deletes).toHaveLength(0);
  context.fetcher.mockImplementation(async () => []);
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(context.store.getMonitorDeliveries()).toEqual([]);
});

test("renewed expiry survives restart and fetch failures clean only at the new deadline", async () => {
  const directory = temporaryDirectory();
  directories.push(directory);
  const filename = join(directory, "expiry.sqlite");
  const context = setup(filename);
  let time = 1_800_000_000_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in 16 seconds" }),
  ]);
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  const createdAt = time;
  expect(context.store.getDelivery(scopeA, "123")?.expiresAt).toBe(
    time + 16_000,
  );
  time += 16_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in 14 minutes" }),
  ]);
  await monitor.check();
  const updatedAt = time;
  const expiresAt = time + 840_000;
  expect(context.deletes).toEqual([]);
  expect(context.store.getDelivery(scopeA, "123")).toMatchObject({
    createdAt,
    updatedAt,
    expiresAt,
  });
  context.store.close();
  const reopened = new SubscriptionStore(filename);
  stores.push(reopened);
  context.fetcher.mockImplementation(async () => {
    throw new Error("HTTP 503");
  });
  time += 16_000;
  const restarted = createMonitor(
    context.client,
    reopened,
    context.fetcher,
    () => time,
  );
  await restarted.check();
  expect(context.deletes).toEqual([]);
  expect(reopened.getDelivery(scopeA, "123")).toMatchObject({
    createdAt,
    updatedAt,
    expiresAt,
  });
  time = expiresAt;
  await restarted.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(reopened.getMonitorDeliveries()).toEqual([]);
  expect(reopened.getSubscriptions(scopeA)).toHaveLength(1);
});

test("fetch failure preserves active messages and later empty snapshots clean them", async () => {
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  context.fetcher.mockImplementation(async () => {
    throw new Error("invalid page");
  });
  await monitor.check();
  expect(context.deletes).toEqual([]);
  expect(context.store.getDelivery(scopeA, "123")).not.toBeNull();
  context.fetcher.mockImplementation(async () => []);
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
});

test("failed deletions retain state and retry without updating or resending expired listings", async () => {
  const context = setup();
  let time = 1_800_000_000_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in a minute" }),
  ]);
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  const previous = context.store.getDelivery(scopeA, "123")!;
  time += 60_000;
  context.fetcher.mockImplementation(async () => [listing({ expires: "now" })]);
  context.control.deleteError = Object.assign(
    new Error("Missing Permissions"),
    { code: 50013 },
  );
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).toEqual({
    ...previous,
    updatedAt: time,
  });
  context.control.deleteError = undefined;
  await monitor.check();
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(context.store.getMonitorDeliveries()).toEqual([]);
  expect(context.sends).toHaveLength(1);
  expect(context.edits).toEqual([]);
});

test("an already deleted message is successful cleanup", async () => {
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  context.control.deleteError = Object.assign(new Error("Unknown Message"), {
    code: 10008,
  });
  context.fetcher.mockImplementation(async () => []);
  await monitor.check();
  expect(context.store.getMonitorDeliveries()).toEqual([]);
  expect(context.messageCache.size).toBe(0);
});

test("cleanup runs without send or embed permissions", async () => {
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  context.control.permissions = new PermissionsBitField(0n);
  context.fetcher.mockImplementation(async () => []);
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(context.store.getMonitorDeliveries()).toEqual([]);
});

test("Discord-confirmed deleted channels clear state; inaccessible channels preserve it", async () => {
  const context = setup();
  await createMonitor(context.client, context.store, context.fetcher).check();
  const fetchChannel = spyOn(context.client.channels, "fetch");
  fetchChannel.mockRejectedValue(
    Object.assign(new Error("Missing Access"), { code: 50001 }),
  );
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).not.toBeNull();
  fetchChannel.mockRejectedValue(
    Object.assign(new Error("Unknown Channel"), { code: 10003 }),
  );
  await monitor.check();
  expect(context.store.getMonitorDeliveries()).toEqual([]);
  expect(context.store.getSubscriptions(scopeA)).toHaveLength(1);
});

test("a renewed deadline refreshes unchanged messages before checking the old expiry", async () => {
  const context = setup();
  let time = 1_800_000_000_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in a minute" }),
  ]);
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  const createdAt = time;
  time += 60_000;
  await monitor.check();
  expect(context.deletes).toEqual([]);
  expect(context.sends).toHaveLength(1);
  expect(context.edits).toEqual([]);
  expect(context.store.getDelivery(scopeA, "123")).toMatchObject({
    createdAt,
    updatedAt: time,
    expiresAt: time + 60_000,
  });
  expect(context.store.getExpiredListingIds()).toEqual([]);
  time += 60_000;
  context.fetcher.mockImplementation(async () => {
    throw new Error("offline");
  });
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
});

test("unknown expiry retains its bounded deadline until a valid website renewal", async () => {
  const context = setup();
  let time = 1_800_000_000_000;
  const createdAt = time;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "unknown" }),
  ]);
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  time += 60_000;
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).toMatchObject({
    createdAt,
    updatedAt: time,
    expiresAt: createdAt + 3_600_000,
  });
  time = createdAt + 3_600_000;
  await monitor.check();
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(context.sends).toHaveLength(1);
  expect(context.store.getExpiredListingIds()).toEqual(["123"]);
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in 10 minutes" }),
  ]);
  await monitor.check();
  expect(context.sends).toHaveLength(2);
  expect(context.store.getExpiredListingIds()).toEqual([]);
  expect(context.store.getDelivery(scopeA, "123")).toMatchObject({
    createdAt: time,
    updatedAt: time,
    expiresAt: time + 600_000,
  });
});

test("the latest website countdown can shorten the deadline and survives a failed fetch", async () => {
  const context = setup();
  let time = 1_800_000_000_000;
  const createdAt = time;
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  time += 60_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in 10 seconds" }),
  ]);
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).toMatchObject({
    createdAt,
    updatedAt: time,
    expiresAt: time + 10_000,
  });
  time += 10_000;
  context.fetcher.mockImplementation(async () => {
    throw new Error("offline");
  });
  await monitor.check();
  expect(context.deletes).toEqual(["message-1"]);
  expect(context.store.getDelivery(scopeA, "123")).toBeNull();
});

test("failed edits retain the successful payload while persisting renewed expiry", async () => {
  const context = setup();
  let time = 1_800_000_000_000;
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in a minute" }),
  ]);
  const monitor = createMonitor(
    context.client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  const previous = context.store.getDelivery(scopeA, "123")!;
  time += 60_000;
  context.fetcher.mockImplementation(async () => [
    listing({ description: "Updated", expires: "in 10 minutes" }),
  ]);
  context.control.editError = new Error("offline");
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).toEqual({
    ...previous,
    updatedAt: time,
    expiresAt: time + 600_000,
  });
  expect(context.deletes).toEqual([]);
  expect(context.sends).toHaveLength(1);
  context.control.editError = undefined;
  await monitor.check();
  expect(context.edits).toHaveLength(1);
  expect(context.store.getDelivery(scopeA, "123")?.messageId).toBe(
    previous.messageId,
  );
  expect(context.store.getDelivery(scopeA, "123")?.payloadHash).not.toBe(
    previous.payloadHash,
  );
});

test("renewals reach all channels even after cancellation or loss of access", async () => {
  const context = setup();
  const b = fakeChannel(scopeB);
  context.store.addSubscription(scopeB, "Ultimate", "user");
  let time = 1_800_000_000_000;
  const createdAt = time;
  const client = fakeClient([context.channel, b.channel]);
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "in a minute" }),
  ]);
  const monitor = createMonitor(
    client,
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  for (const sub of context.store.getMonitorSubscriptions())
    context.store.removeSubscription(sub, sub.id);
  spyOn(client.channels, "fetch").mockResolvedValue(null);
  time += 60_000;
  await monitor.check();
  for (const scope of [scopeA, scopeB]) {
    expect(context.store.getDelivery(scope, "123")).toMatchObject({
      createdAt,
      updatedAt: time,
      expiresAt: time + 60_000,
    });
  }
  expect(context.store.getExpiredListingIds()).toEqual([]);
  expect(context.deletes).toEqual([]);
  expect(b.deletes).toEqual([]);
});

test("a renewed ID clears persisted expiry suppression before any channel is processed", async () => {
  const context = setup();
  const b = fakeChannel(scopeB);
  context.store.addSubscription(scopeB, "Ultimate", "user");
  let time = 1_800_000_000_000;
  context.store.markListingExpired("123", time, time);
  const monitor = createMonitor(
    fakeClient([context.channel, b.channel]),
    context.store,
    context.fetcher,
    () => time,
  );
  await monitor.check();
  expect(context.store.getExpiredListingIds()).toEqual([]);
  expect(context.sends).toHaveLength(1);
  expect(b.sends).toHaveLength(1);
  // No fields change, but a later observation must still be persisted.
  time += 60_000;
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")?.updatedAt).toBe(time);
  expect(context.store.getDelivery(scopeB, "123")?.expiresAt).toBe(
    time + 3_600_000,
  );
  expect(context.sends).toHaveLength(1);
  expect(b.sends).toHaveLength(1);
});

test("already expired website listings are not sent and an idle monitor does not fetch", async () => {
  const context = setup();
  context.fetcher.mockImplementation(async () => [
    listing({ expires: "now" }),
    listing({ id: "zero", expires: "in 0 seconds" }),
  ]);
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  expect(context.sends).toEqual([]);
  for (const sub of context.store.getSubscriptions(scopeA))
    context.store.removeSubscription(scopeA, sub.id);
  await monitor.check();
  expect(context.fetcher).toHaveBeenCalledTimes(1);
});

test("overlapping patterns and duplicate listing rows send one message", async () => {
  const context = setup();
  context.store.addSubscription(scopeA, "Practice", "user");
  context.fetcher.mockImplementation(async () => [listing(), listing()]);
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  await monitor.check();
  expect(context.sends).toHaveLength(1);
  expect(context.edits).toHaveLength(0);
});

test("multi-select filters use OR within each set and AND with the regex", async () => {
  const context = setup(":memory:", {
    dataCentres: ["Mana", "Light"],
    categories: ["HighEndDuty", "Trials"],
  });
  context.fetcher.mockImplementation(async () => [
    listing({ id: "mana-high" }),
    listing({ id: "light-trial", dataCentre: "Light", category: "Trials" }),
    listing({ id: "wrong-centre", dataCentre: "Gaia" }),
    listing({ id: "wrong-category", category: "None" }),
    listing({ id: "wrong-regex", rawText: "Extreme Practice" }),
  ]);
  await createMonitor(context.client, context.store, context.fetcher).check();
  expect(context.sends).toHaveLength(2);
  expect(context.store.getDelivery(scopeA, "mana-high")).not.toBeNull();
  expect(context.store.getDelivery(scopeA, "light-trial")).not.toBeNull();
  for (const id of ["wrong-centre", "wrong-category", "wrong-regex"])
    expect(context.store.getDelivery(scopeA, id)).toBeNull();
});

test("edited conditions take effect on the next check while retaining existing deliveries", async () => {
  const context = setup(":memory:", {
    dataCentres: ["Mana"],
    categories: ["HighEndDuty"],
  });
  context.fetcher.mockImplementation(async () => [
    listing({ id: "original" }),
    listing({
      id: "edited",
      duty: "Savage",
      rawText: "Savage Practice",
      dataCentre: "Light",
      category: "Trials",
    }),
    listing({ id: "wrong-regex", dataCentre: "Light", category: "Trials" }),
    listing({
      id: "wrong-centre",
      duty: "Savage",
      rawText: "Savage Practice",
      category: "Trials",
    }),
    listing({
      id: "wrong-category",
      duty: "Savage",
      rawText: "Savage Practice",
      dataCentre: "Light",
    }),
  ]);
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  expect(context.sends).toHaveLength(1);
  const originalDelivery = context.store.getDelivery(scopeA, "original");
  const subscription = context.store.getSubscriptions(scopeA)[0]!;
  expect(
    context.store.updateSubscription(scopeA, subscription.id, "Savage", {
      dataCentres: ["Light"],
      categories: ["Trials"],
    }).ok,
  ).toBe(true);
  await monitor.check();
  expect(context.sends).toHaveLength(2);
  expect(
    context.store
      .getMonitorDeliveries()
      .map((delivery) => delivery.listingId)
      .sort(),
  ).toEqual(["edited", "original"]);
  expect(context.store.getDelivery(scopeA, "original")).toEqual(
    originalDelivery,
  );
  expect(context.deletes).toEqual([]);
});

test("each empty filter independently leaves that dimension unrestricted", async () => {
  const cases: { filters: SubscriptionFilters; expected: string[] }[] = [
    { filters: {}, expected: ["mana-high", "gaia-high", "mana-trial"] },
    {
      filters: { dataCentres: ["Mana"], categories: [] },
      expected: ["mana-high", "mana-trial"],
    },
    {
      filters: { dataCentres: [], categories: ["HighEndDuty"] },
      expected: ["mana-high", "gaia-high"],
    },
  ];
  for (const { filters, expected } of cases) {
    const context = setup(":memory:", filters);
    context.fetcher.mockImplementation(async () => [
      listing({ id: "mana-high" }),
      listing({ id: "gaia-high", dataCentre: "Gaia" }),
      listing({ id: "mana-trial", category: "Trials" }),
    ]);
    await createMonitor(context.client, context.store, context.fetcher).check();
    expect(context.sends).toHaveLength(expected.length);
    for (const id of ["mana-high", "gaia-high", "mana-trial"])
      expect(context.store.getDelivery(scopeA, id) !== null).toBe(
        expected.includes(id),
      );
  }
});

test("the same regex with overlapping filters appears once in a notification", async () => {
  const context = setup(":memory:", { dataCentres: ["Mana"] });
  context.store.addSubscription(scopeA, "Ultimate", "user", {
    categories: ["HighEndDuty"],
  });
  context.store.addSubscription(scopeA, "Foreign", "user", {
    dataCentres: ["Gaia"],
  });
  await createMonitor(context.client, context.store, context.fetcher).check();
  expect(context.sends).toHaveLength(1);
  const payload = context.sends[0]!.payload as { embeds: EmbedBuilder[] };
  expect(payload.embeds[0]!.toJSON().footer?.text).toBe("Ultimate");
});

test("failed sends retry and never mark the recruitment as delivered", async () => {
  spyOn(console, "error").mockImplementation(() => {});
  const context = setup();
  context.control.sendError = new Error("offline");
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).toBeNull();
  context.control.sendError = undefined;
  await monitor.check();
  expect(context.sends).toHaveLength(1);
  expect(context.store.getDelivery(scopeA, "123")?.messageId).toBe("message-1");
});

test("a new channel or a newly matching pattern receives a previously seen listing", async () => {
  const context = setup();
  const b = fakeChannel(scopeB);
  const monitor = createMonitor(
    fakeClient([context.channel, b.channel]),
    context.store,
    context.fetcher,
  );
  context.store.addSubscription(scopeB, "Savage", "user");
  await monitor.check();
  expect(b.sends).toHaveLength(0);
  context.store.addSubscription(scopeB, "Ultimate", "user");
  await monitor.check();
  expect(context.sends).toHaveLength(1);
  expect(b.sends).toHaveLength(1);
});

test("updates edit the original message and failed edits keep the old successful state", async () => {
  spyOn(console, "error").mockImplementation(() => {});
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  const oldDelivery = context.store.getDelivery(scopeA, "123");
  context.fetcher.mockImplementation(async () => [
    listing({ description: "New strategy", rawText: "Ultimate New strategy" }),
  ]);
  context.control.editError = new Error("offline");
  await monitor.check();
  expect(context.store.getDelivery(scopeA, "123")).toEqual(oldDelivery);
  expect(context.sends).toHaveLength(1);
  context.control.editError = undefined;
  await monitor.check();
  await monitor.check();
  expect(context.edits).toHaveLength(1);
  expect(context.edits[0]?.id).toBe("message-1");
  expect(context.store.getDelivery(scopeA, "123")?.payloadHash).not.toBe(
    oldDelivery?.payloadHash,
  );
});

test("reopening SQLite and recreating the monitor does not send again", async () => {
  const directory = temporaryDirectory();
  directories.push(directory);
  const filename = join(directory, "restart.sqlite");
  const context = setup(filename);
  await createMonitor(context.client, context.store, context.fetcher).check();
  context.store.close();
  const reopened = new SubscriptionStore(filename);
  stores.push(reopened);
  await createMonitor(context.client, reopened, context.fetcher).check();
  expect(context.sends).toHaveLength(1);
  expect(context.edits).toHaveLength(0);
});

test("a deleted message is replaced, other errors never create a second message", async () => {
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  context.fetcher.mockImplementation(async () => [
    listing({ description: "Updated" }),
  ]);
  context.control.editError = Object.assign(new Error("Unknown Message"), {
    code: 10008,
  });
  await monitor.check();
  expect(context.sends).toHaveLength(2);
  expect(context.store.getDelivery(scopeA, "123")?.messageId).toBe("message-2");
});

test("simultaneous checks share one run", async () => {
  const context = setup();
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await Promise.all([monitor.check(), monitor.check(), monitor.check()]);
  expect(context.fetcher).toHaveBeenCalledTimes(1);
  expect(context.sends).toHaveLength(1);
});

test("guild mismatches cannot route a notification into another guild", async () => {
  const context = setup();
  await createMonitor(
    fakeClient([fakeChannel({ ...scopeA, guildId: "foreign" }).channel]),
    context.store,
    context.fetcher,
  ).check();
  expect(context.store.getDelivery(scopeA, "123")).toBeNull();
});

test("permission failures preserve subscriptions and retry after permissions recover", async () => {
  spyOn(console, "warn").mockImplementation(() => {});
  const context = setup();
  context.control.permissions = new PermissionsBitField(0n);
  const monitor = createMonitor(context.client, context.store, context.fetcher);
  await monitor.check();
  expect(context.store.getSubscriptions(scopeA)).toHaveLength(1);
  expect(context.sends).toHaveLength(0);
  context.control.permissions = fakeChannel().control.permissions;
  await monitor.check();
  expect(context.sends).toHaveLength(1);
});

test("notifications can be sent to announcements and all supported thread types", async () => {
  for (const type of [
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ]) {
    const context = setup();
    const channel = fakeChannel(scopeA, type);
    await createMonitor(
      fakeClient([channel.channel]),
      context.store,
      context.fetcher,
    ).check();
    expect(channel.sends).toHaveLength(1);
  }
});

test("loss of private thread membership stops delivery and recovery retries", async () => {
  spyOn(console, "warn").mockImplementation(() => {});
  const context = setup();
  const fixture = fakeChannel(scopeA, ChannelType.PrivateThread);
  const monitor = createMonitor(
    fakeClient([fixture.channel]),
    context.store,
    context.fetcher,
  );
  fixture.control.threadMemberError = Object.assign(
    new Error("Missing Access"),
    { code: 50001 },
  );
  await monitor.check();
  expect(fixture.sends).toHaveLength(0);
  expect(context.store.getDelivery(scopeA, "123")).toBeNull();
  expect(context.store.getSubscriptions(scopeA)).toHaveLength(1);
  fixture.control.threadMemberError = undefined;
  await monitor.check();
  expect(fixture.sends).toHaveLength(1);
});
