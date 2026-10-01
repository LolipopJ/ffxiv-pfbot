import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { join } from "path";

import { data as listData, execute as listCommand } from "../src/commands/list";
import {
  buildSubscriptionForm,
  data as subscribeData,
  execute as subscribeCommand,
  isSubscriptionInteraction,
} from "../src/commands/subscribe";
import { execute as unsubscribeCommand } from "../src/commands/unsubscribe";
import { CATEGORY_LABEL, DATA_CENTRE } from "../src/constants";
import { closeStore, getStore } from "../src/services/store";
import {
  buildSubscriptionPage,
  isPagerInteraction,
} from "../src/services/subscription-pager";
import {
  getBotSendError,
  getCommandContext,
  isNotificationChannel,
} from "../src/utils/channel";
import {
  allPermissions,
  fakeChannel,
  removeTemporaryDirectory,
  scopeA,
  scopeB,
  temporaryDirectory,
} from "./helpers";

let directory: string;
const previousDatabasePath = process.env.DATABASE_PATH;
beforeEach(() => {
  directory = temporaryDirectory();
  process.env.DATABASE_PATH = join(directory, "commands.sqlite");
});
afterEach(() => {
  closeStore();
  if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabasePath;
  removeTemporaryDirectory(directory);
});

interface Action {
  kind:
    | "next"
    | "previous"
    | "delete"
    | "data-centres"
    | "categories"
    | "confirm"
    | "cancel";
  id?: string;
  values?: string[];
  before?: () => void;
  permissions?: PermissionsBitField;
}
interface View {
  content?: string;
  components?: unknown[];
  flags?: number;
}

function interactionFixture(
  options: { keyword?: string; page?: number; actions?: Action[] } = {},
) {
  const channel = fakeChannel();
  const views: View[] = [];
  const deferred: { flags?: number }[] = [];
  const componentReplies: View[] = [];
  const actions = [...(options.actions ?? [])];
  let current: View;
  const base = {
    guildId: scopeA.guildId,
    channelId: scopeA.channelId,
    channel: channel.channel,
    memberPermissions: allPermissions,
    inGuild: () => true,
    user: { id: "user" },
  };
  const message = {
    awaitMessageComponent: async ({
      filter,
    }: {
      filter: (i: MessageComponentInteraction) => boolean;
    }) => {
      const action = actions.shift();
      if (!action) throw new Error("simulated timeout");
      action.before?.();
      const row = current.components?.[0] as {
        toJSON(): { components: { custom_id: string }[] };
      };
      const customId = row.toJSON().components[0]!.custom_id;
      const session = customId.slice(0, customId.lastIndexOf(":"));
      const selection = {
        ...base,
        memberPermissions: action.permissions ?? allPermissions,
        customId: `${session}:${action.kind}`,
        values: action.values ?? [action.id ?? ""],
        isButton: () =>
          !["delete", "data-centres", "categories"].includes(action.kind),
        isStringSelectMenu: () =>
          ["delete", "data-centres", "categories"].includes(action.kind),
        update: async (payload: View) => {
          views.push(payload);
          current = payload;
        },
        reply: async (payload: View) => {
          componentReplies.push(payload);
        },
        deferUpdate: async () => {},
      } as unknown as MessageComponentInteraction;
      if (!filter(selection)) throw new Error("rejected fixture interaction");
      return selection;
    },
  };
  const interaction = {
    ...base,
    options: {
      getString: () => options.keyword ?? "Ultimate",
      getInteger: () => options.page ?? null,
    },
    deferReply: async (payload: { flags?: number }) => {
      deferred.push(payload);
    },
    editReply: async (payload: View) => {
      views.push(payload);
      current = payload;
      return message;
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, views, deferred, componentReplies, ...channel };
}

test("commands have no target channel option and subscriptions are acknowledged privately", async () => {
  for (const command of [listData, subscribeData]) {
    expect(
      command.toJSON().options?.some((option) => option.name === "channel"),
    ).toBe(false);
  }
  const fixture = interactionFixture({ actions: [{ kind: "confirm" }] });
  await subscribeCommand(fixture.interaction);
  expect(fixture.deferred[0]?.flags).toBe(MessageFlags.Ephemeral);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(1);
  expect(getStore().getSubscriptions(scopeB)).toHaveLength(0);
  expect(fixture.views.at(-1)?.content).toContain("成功在当前频道创建招募订阅");
  expect(getStore().getSubscriptions(scopeA)[0]).toMatchObject({
    dataCentres: [],
    categories: [],
  });
});

test("subscribe offers optional multi-selects using all constant labels", () => {
  const form = buildSubscriptionForm("session", "Ultimate", {});
  const [centres, categories] = form.components
    .slice(0, 2)
    .map((row) => row.toJSON().components[0]);
  expect(centres).toMatchObject({
    min_values: 0,
    max_values: Object.keys(DATA_CENTRE).length,
    options: Object.entries(DATA_CENTRE).map(([value, label]) => ({
      value,
      label,
    })),
  });
  expect(categories).toMatchObject({
    min_values: 0,
    max_values: Object.keys(CATEGORY_LABEL).length,
    options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
      value,
      label,
    })),
  });
});

test("subscribe saves both multi-selects only after confirmation", async () => {
  const fixture = interactionFixture({
    actions: [
      { kind: "data-centres", values: ["Mana", "Light"] },
      { kind: "categories", values: ["Trials", "HighEndDuty"] },
      {
        kind: "confirm",
        before: () =>
          expect(getStore().getSubscriptions(scopeA)).toHaveLength(0),
      },
    ],
  });
  await subscribeCommand(fixture.interaction);
  expect(getStore().getSubscriptions(scopeA)[0]).toMatchObject({
    dataCentres: ["Light", "Mana"],
    categories: ["HighEndDuty", "Trials"],
  });
  expect(fixture.views.at(-1)?.content).toContain("Mana (JP)");
  expect(fixture.views.at(-1)?.content).toContain("讨伐歼灭战");
  expect(fixture.views.at(-1)?.components).toEqual([]);
});

test("selections can be cleared and cancel or timeout never creates a subscription", async () => {
  const cleared = interactionFixture({
    actions: [
      { kind: "data-centres", values: ["Mana"] },
      { kind: "categories", values: ["Trials"] },
      { kind: "data-centres", values: [] },
      { kind: "categories", values: [] },
      { kind: "confirm" },
    ],
  });
  await subscribeCommand(cleared.interaction);
  expect(getStore().getSubscriptions(scopeA)[0]).toMatchObject({
    dataCentres: [],
    categories: [],
  });
  const cancelled = interactionFixture({
    keyword: "Savage",
    actions: [{ kind: "cancel" }],
  });
  await subscribeCommand(cancelled.interaction);
  const timedOut = interactionFixture({ keyword: "Extreme" });
  await subscribeCommand(timedOut.interaction);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(1);
  expect(cancelled.views.at(-1)?.content).toContain("已取消");
  expect(timedOut.views.at(-1)?.content).toContain("超时");
  expect(timedOut.views.at(-1)?.components).toEqual([]);
});

test("subscribe rechecks user and bot permissions before saving", async () => {
  const revoked = interactionFixture({
    actions: [{ kind: "confirm", permissions: new PermissionsBitField(0n) }],
  });
  await subscribeCommand(revoked.interaction);
  expect(revoked.views.at(-1)?.content).toContain("管理频道权限");
  const botRevoked = interactionFixture({
    actions: [
      {
        kind: "confirm",
        before: () => {
          botRevoked.control.permissions = new PermissionsBitField(0n);
        },
      },
    ],
  });
  await subscribeCommand(botRevoked.interaction);
  expect(botRevoked.views.at(-1)?.content).toContain("机器人需要");
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(0);
});

test("invalid patterns and filter values are rejected without saving", async () => {
  const invalidPattern = interactionFixture({ keyword: "[" });
  await subscribeCommand(invalidPattern.interaction);
  expect(invalidPattern.views[0]?.content).toContain("无效的 RE2");
  const invalidFilter = interactionFixture({
    actions: [{ kind: "data-centres", values: ["toString"] }],
  });
  await subscribeCommand(invalidFilter.interaction);
  expect(invalidFilter.componentReplies[0]?.content).toContain(
    "无效的筛选条件",
  );
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(0);
});

test("subscription sessions bind valid component actions to user, guild, channel and session", () => {
  const selection = {
    user: { id: "user" },
    ...scopeA,
    customId: "session:confirm",
    isButton: () => true,
    isStringSelectMenu: () => false,
  } as unknown as MessageComponentInteraction;
  expect(isSubscriptionInteraction(selection, "user", scopeA, "session")).toBe(
    true,
  );
  expect(isSubscriptionInteraction(selection, "other", scopeA, "session")).toBe(
    false,
  );
  expect(isSubscriptionInteraction(selection, "user", scopeB, "session")).toBe(
    false,
  );
  expect(
    isSubscriptionInteraction(
      selection,
      "user",
      { ...scopeA, guildId: "foreign" },
      "session",
    ),
  ).toBe(false);
  expect(
    isSubscriptionInteraction(selection, "user", scopeA, "other-session"),
  ).toBe(false);
});

test("runtime permissions reject commands even if Discord command defaults are overridden", async () => {
  const fixture = interactionFixture();
  Object.defineProperty(fixture.interaction, "memberPermissions", {
    value: new PermissionsBitField(0n),
  });
  await subscribeCommand(fixture.interaction);
  await listCommand(fixture.interaction);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(0);
  expect(
    fixture.views.every((view) => view.content?.includes("管理频道权限")),
  ).toBe(true);
});

test("subscribe validates bot permissions before saving", async () => {
  const fixture = interactionFixture();
  fixture.control.permissions = new PermissionsBitField(0n);
  await subscribeCommand(fixture.interaction);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(0);
  expect(fixture.views[0]?.content).toContain("机器人需要");
});

test("announcements and threads are supported while voice, forum and private messages are rejected", async () => {
  for (const type of [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ]) {
    const fixture = fakeChannel(scopeA, type);
    expect(isNotificationChannel(fixture.channel)).toBe(true);
    expect(await getBotSendError(fixture.channel)).toBeNull();
  }
  for (const type of [
    ChannelType.GuildVoice,
    ChannelType.GuildForum,
    ChannelType.DM,
  ]) {
    const fixture = fakeChannel(scopeA, type);
    expect(isNotificationChannel(fixture.channel)).toBe(false);
  }
  const fixture = interactionFixture();
  Object.defineProperty(fixture.interaction, "inGuild", { value: () => false });
  expect(getCommandContext(fixture.interaction).ok).toBe(false);
  const thread = fakeChannel(scopeA, ChannelType.PublicThread);
  thread.control.archived = true;
  expect(await getBotSendError(thread.channel)).toContain("归档");
});

test("list hides other channels' patterns and creators", async () => {
  getStore().addSubscription(scopeA, "CURRENT", "user");
  getStore().addSubscription(scopeB, "FOREIGN_SECRET", "foreign-user");
  const fixture = interactionFixture();
  await listCommand(fixture.interaction);
  expect(fixture.deferred[0]?.flags).toBe(MessageFlags.Ephemeral);
  expect(fixture.views[0]?.content).toContain("CURRENT");
  expect(fixture.views[0]?.content).not.toContain("FOREIGN_SECRET");
  expect(fixture.views[0]?.content).not.toContain("foreign-user");
});

test("private threads require bot membership unless it can manage threads", async () => {
  const fixture = fakeChannel(scopeA, ChannelType.PrivateThread);
  fixture.control.threadMemberError = Object.assign(
    new Error("Unknown Member"),
    { code: 10007 },
  );
  expect(await getBotSendError(fixture.channel)).toContain("加入线程");
  fixture.control.threadMemberError = undefined;
  expect(await getBotSendError(fixture.channel)).toBeNull();
  fixture.control.permissions = new PermissionsBitField(
    allPermissions.bitfield | PermissionFlagsBits.ManageThreads,
  );
  fixture.control.threadMemberError = new Error(
    "must not check membership for a moderator",
  );
  expect(await getBotSendError(fixture.channel)).toBeNull();
  expect(fixture.control.threadMemberChecks).toBe(2);
});

test("thread sending needs SendMessagesInThreads and timed out bots fail closed", async () => {
  const fixture = fakeChannel(scopeA, ChannelType.PublicThread);
  fixture.control.permissions = new PermissionsBitField(
    allPermissions.bitfield & ~PermissionFlagsBits.SendMessagesInThreads,
  );
  expect(await getBotSendError(fixture.channel)).toContain("机器人需要");
  fixture.control.permissions = new PermissionsBitField(
    allPermissions.bitfield & ~PermissionFlagsBits.SendMessages,
  );
  expect(await getBotSendError(fixture.channel)).toBeNull();
  fixture.control.timedOut = true;
  expect(await getBotSendError(fixture.channel)).toContain("禁言");
});

test("list pagination buttons navigate and long patterns fit into 2000 characters", async () => {
  for (let i = 0; i < 7; i++)
    getStore().addSubscription(scopeA, `${i}-` + "x".repeat(998), "user");
  const fixture = interactionFixture({
    actions: [{ kind: "next" }, { kind: "previous" }],
  });
  await listCommand(fixture.interaction);
  expect(fixture.views[0]?.content).toContain("第 1/2 页");
  expect(fixture.views[1]?.content).toContain("第 2/2 页");
  expect(fixture.views[2]?.content).toContain("第 1/2 页");
  expect(
    fixture.views.every((view) => !view.content || view.content.length <= 2000),
  ).toBe(true);
});

test("unsubscribe paginates beyond 25 options and cannot delete a foreign ID", async () => {
  for (let i = 0; i < 26; i++)
    getStore().addSubscription(scopeA, String(i), "user");
  const foreign = getStore().addSubscription(scopeB, "SECRET", "other");
  if (!foreign.ok) throw new Error("setup failed");
  const view = buildSubscriptionPage(
    getStore(),
    scopeA,
    0,
    "unsubscribe",
    "session",
  );
  expect(view.subscriptions).toHaveLength(25);
  expect(view.pageCount).toBe(2);
  for (const component of view.payload.components)
    expect(() => component.toJSON()).not.toThrow();
  const fixture = interactionFixture({
    actions: [{ kind: "delete", id: foreign.sub.id }],
  });
  await unsubscribeCommand(fixture.interaction);
  expect(getStore().getSubscriptions(scopeB)).toHaveLength(1);
  expect(fixture.componentReplies[0]?.flags).toBe(MessageFlags.Ephemeral);
  expect(fixture.componentReplies[0]?.content).not.toContain("SECRET");
});

test("unsubscribe works on later pages and rechecks permissions at selection time", async () => {
  for (let i = 0; i < 26; i++)
    getStore().addSubscription(scopeA, String(i), "user");
  const last = getStore().getSubscriptionsPage(scopeA, 1, 25).subscriptions[0]!;
  const revoked = interactionFixture({
    page: 2,
    actions: [
      { kind: "delete", id: last.id, permissions: new PermissionsBitField(0n) },
    ],
  });
  await unsubscribeCommand(revoked.interaction);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(26);
  const allowed = interactionFixture({
    page: 2,
    actions: [{ kind: "delete", id: last.id }],
  });
  await unsubscribeCommand(allowed.interaction);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(25);
});

test("pager sessions bind component actions to user, guild, channel and session", () => {
  const interaction = {
    user: { id: "user" },
    ...scopeA,
    customId: "session:next",
  } as unknown as MessageComponentInteraction;
  expect(isPagerInteraction(interaction, "user", scopeA, "session")).toBe(true);
  expect(isPagerInteraction(interaction, "other", scopeA, "session")).toBe(
    false,
  );
  expect(isPagerInteraction(interaction, "user", scopeB, "session")).toBe(
    false,
  );
  expect(
    isPagerInteraction(
      interaction,
      "user",
      { ...scopeA, guildId: "foreign" },
      "session",
    ),
  ).toBe(false);
  expect(isPagerInteraction(interaction, "user", scopeA, "other-session")).toBe(
    false,
  );
});
