import { afterEach, expect, mock, spyOn, test } from "bun:test";
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
  expect(payload.embeds[0]!.toJSON().footer?.text).toBe("Mana | Ultimate");
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
