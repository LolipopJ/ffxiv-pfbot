import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  ComponentType,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  PermissionsBitField,
  TextInputStyle,
} from "discord.js";
import { join } from "path";

import { data as editData, execute as editCommand } from "../src/commands/edit";
import { data as listData, execute as listCommand } from "../src/commands/list";
import {
  data as subscribeData,
  execute as subscribeCommand,
} from "../src/commands/subscribe";
import { execute as unsubscribeCommand } from "../src/commands/unsubscribe";
import { CATEGORY_LABEL, DATA_CENTRE_LABEL } from "../src/locales/zh-cn";
import { closeStore, getStore } from "../src/services/store";
import {
  buildSubscriptionForm,
  isSubscriptionInteraction,
} from "../src/services/subscription-form";
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
  kind: "next" | "previous" | "delete" | "edit";
  id?: string;
  before?: () => void;
  permissions?: PermissionsBitField;
}
interface Submission {
  keyword?: string;
  dataCentres?: string[];
  categories?: string[];
  before?: () => void;
  permissions?: PermissionsBitField;
}
interface View {
  content?: string;
  components?: unknown[];
  flags?: number;
}

function interactionFixture(
  options: {
    page?: number;
    actions?: Action[];
    submission?: Submission | null;
  } = {},
) {
  const channel = fakeChannel();
  const views: View[] = [];
  const deferred: { flags?: number }[] = [];
  const componentReplies: View[] = [];
  const modals: ModalBuilder[] = [];
  const actions = [...(options.actions ?? [])];
  let current: View;
  let acknowledged = false;
  const base = {
    guildId: scopeA.guildId,
    channelId: scopeA.channelId,
    channel: channel.channel,
    memberPermissions: allPermissions,
    inGuild: () => true,
    user: { id: "user" },
  };
  const modalMethods = {
    showModal: async (form: ModalBuilder) => {
      modals.push(form);
    },
    awaitModalSubmit: async ({
      filter,
    }: {
      filter: (i: ModalSubmitInteraction) => boolean;
    }) => {
      await Promise.resolve();
      if (options.submission === null) throw new Error("simulated timeout");
      const submission = options.submission ?? {};
      submission.before?.();
      const form = modals.at(-1)!.toJSON();
      const fields = form.components.map((label) => {
        if (label.type !== ComponentType.Label)
          throw new Error("expected modal labels");
        return label.component;
      });
      const keyword = fields.find(
        (field) => field.type === ComponentType.TextInput,
      );
      const defaults = (customId: string) => {
        const select = fields.find(
          (field) =>
            field.type === ComponentType.StringSelect &&
            field.custom_id === customId,
        );
        if (select?.type !== ComponentType.StringSelect)
          throw new Error("missing select");
        return select.options
          .filter((option) => option.default)
          .map((option) => option.value);
      };
      const submitted = {
        ...base,
        customId: form.custom_id,
        memberPermissions: submission.permissions ?? allPermissions,
        fields: {
          getTextInputValue: () =>
            submission.keyword ?? keyword?.value ?? "Ultimate",
          getStringSelectValues: (customId: string) =>
            customId === "data-centres"
              ? (submission.dataCentres ?? defaults(customId))
              : (submission.categories ?? defaults(customId)),
        },
        deferReply: async (payload: { flags?: number }) => {
          deferred.push(payload);
        },
        editReply: async (payload: View) => {
          views.push(payload);
          return message;
        },
      } as unknown as ModalSubmitInteraction;
      if (!filter(submitted)) throw new Error("rejected fixture modal");
      return submitted;
    },
    followUp: async (payload: View) => {
      views.push(payload);
      return message;
    },
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
      let componentAcknowledged = false;
      const selection = {
        ...base,
        ...modalMethods,
        memberPermissions: action.permissions ?? allPermissions,
        customId: `${session}:${action.kind}`,
        values: [action.id ?? ""],
        isButton: () => !["delete", "edit"].includes(action.kind),
        isStringSelectMenu: () => ["delete", "edit"].includes(action.kind),
        showModal: async (form: ModalBuilder) => {
          if (componentAcknowledged)
            throw new Error("component was already acknowledged");
          componentAcknowledged = true;
          await modalMethods.showModal(form);
        },
        update: async (payload: View) => {
          componentAcknowledged = true;
          views.push(payload);
          current = payload;
        },
        reply: async (payload: View) => {
          componentAcknowledged = true;
          componentReplies.push(payload);
        },
        deferUpdate: async () => {
          componentAcknowledged = true;
        },
      } as unknown as MessageComponentInteraction;
      if (!filter(selection)) throw new Error("rejected fixture interaction");
      return selection;
    },
  };
  const interaction = {
    ...base,
    ...modalMethods,
    options: { getInteger: () => options.page ?? null },
    showModal: async (form: ModalBuilder) => {
      if (acknowledged) throw new Error("command was already acknowledged");
      acknowledged = true;
      await modalMethods.showModal(form);
    },
    reply: async (payload: View) => {
      acknowledged = true;
      views.push(payload);
    },
    deferReply: async (payload: { flags?: number }) => {
      acknowledged = true;
      deferred.push(payload);
    },
    editReply: async (payload: View) => {
      views.push(payload);
      current = payload;
      return message;
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, views, deferred, componentReplies, modals, ...channel };
}

function formFields(form: ModalBuilder) {
  return form.toJSON().components.map((label) => {
    if (label.type !== ComponentType.Label)
      throw new Error("expected modal labels");
    return label.component;
  });
}

test("commands collect keyword in the form and have no target channel option", () => {
  for (const command of [editData, listData, subscribeData]) {
    expect(
      command
        .toJSON()
        .options?.some((option) =>
          ["channel", "keyword"].includes(option.name),
        ) ?? false,
    ).toBe(false);
  }
});

test("one modal contains keyword and optional multi-selects for both create and edit", () => {
  const form = buildSubscriptionForm("session");
  const [keyword, centres, categories] = formFields(form);
  expect(keyword).toMatchObject({
    custom_id: "keyword",
    style: TextInputStyle.Paragraph,
    required: true,
    min_length: 1,
    max_length: 1000,
  });
  expect(centres).toMatchObject({
    custom_id: "data-centres",
    required: false,
    min_values: 0,
    max_values: Object.keys(DATA_CENTRE_LABEL).length,
    options: Object.entries(DATA_CENTRE_LABEL).map(([value, label]) => ({
      value,
      label,
    })),
  });
  expect(categories).toMatchObject({
    custom_id: "categories",
    required: false,
    min_values: 0,
    max_values: Object.keys(CATEGORY_LABEL).length,
    options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
      value,
      label,
    })),
  });
  expect(form.toJSON().components).toHaveLength(3);
});

test("subscribe saves all submitted fields together and replies privately", async () => {
  const fixture = interactionFixture({
    submission: {
      keyword: "(?i)Savage",
      dataCentres: ["Mana", "Light"],
      categories: ["Trials", "HighEndDuty"],
      before: () => expect(getStore().getSubscriptions(scopeA)).toEqual([]),
    },
  });
  await subscribeCommand(fixture.interaction);
  expect(fixture.modals).toHaveLength(1);
  expect(fixture.deferred[0]?.flags).toBe(MessageFlags.Ephemeral);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(1);
  expect(getStore().getSubscriptions(scopeA)[0]).toMatchObject({
    keyword: "(?i)Savage",
    dataCentres: ["Light", "Mana"],
    categories: ["HighEndDuty", "Trials"],
  });
  expect(getStore().getSubscriptions(scopeB)).toEqual([]);
  expect(fixture.views.at(-1)?.content).toContain("成功在当前频道创建招募订阅");
});

test("subscribe allows unrestricted filters and closing or timeout never creates a subscription", async () => {
  const fixture = interactionFixture();
  await subscribeCommand(fixture.interaction);
  expect(getStore().getSubscriptions(scopeA)[0]).toMatchObject({
    dataCentres: [],
    categories: [],
  });
  const dismissed = interactionFixture({ submission: null });
  await subscribeCommand(dismissed.interaction);
  expect(dismissed.views.at(-1)?.content).toContain("超时");
  expect(dismissed.views.at(-1)?.flags).toBe(MessageFlags.Ephemeral);
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(1);
});

test("subscribe rejects invalid submitted patterns and filter values without saving", async () => {
  for (const submission of [
    { keyword: "[" },
    { keyword: "" },
    { keyword: "x".repeat(1001) },
    { dataCentres: ["toString"] },
    { categories: ["invalid"] },
  ]) {
    const fixture = interactionFixture({ submission });
    await subscribeCommand(fixture.interaction);
    expect(fixture.views.at(-1)?.content).toMatch(/无效|长度/);
  }
  expect(getStore().getSubscriptions(scopeA)).toEqual([]);
});

test("form sessions bind submissions to user, guild, channel and session", () => {
  const submitted = {
    user: { id: "user" },
    ...scopeA,
    customId: "session:subscription",
  } as unknown as ModalSubmitInteraction;
  expect(isSubscriptionInteraction(submitted, "user", scopeA, "session")).toBe(
    true,
  );
  expect(isSubscriptionInteraction(submitted, "other", scopeA, "session")).toBe(
    false,
  );
  expect(isSubscriptionInteraction(submitted, "user", scopeB, "session")).toBe(
    false,
  );
  expect(
    isSubscriptionInteraction(
      submitted,
      "user",
      { ...scopeA, guildId: "foreign" },
      "session",
    ),
  ).toBe(false);
  expect(
    isSubscriptionInteraction(submitted, "user", scopeA, "other-session"),
  ).toBe(false);
});

test("runtime permissions reject commands even if Discord defaults are overridden", async () => {
  const fixture = interactionFixture();
  Object.defineProperty(fixture.interaction, "memberPermissions", {
    value: new PermissionsBitField(0n),
  });
  await subscribeCommand(fixture.interaction);
  await listCommand(fixture.interaction);
  await editCommand(fixture.interaction);
  expect(fixture.modals).toEqual([]);
  expect(
    fixture.views.every((view) => view.content?.includes("管理频道权限")),
  ).toBe(true);
  expect(getStore().getSubscriptions(scopeA)).toEqual([]);
});

test("subscribe rechecks user and bot permissions on modal submission", async () => {
  const revoked = interactionFixture({
    submission: { permissions: new PermissionsBitField(0n) },
  });
  await subscribeCommand(revoked.interaction);
  expect(revoked.views.at(-1)?.content).toContain("管理频道权限");
  const botRevoked = interactionFixture({
    submission: {
      before: () => {
        botRevoked.control.permissions = new PermissionsBitField(0n);
      },
    },
  });
  await subscribeCommand(botRevoked.interaction);
  expect(botRevoked.views.at(-1)?.content).toContain("机器人需要");
  expect(getStore().getSubscriptions(scopeA)).toEqual([]);
});

test("edit prepopulates every field and allows keyword changes within the same form", async () => {
  const original = getStore().addSubscription(scopeA, "Ultimate", "creator", {
    dataCentres: ["Mana"],
    categories: ["HighEndDuty"],
  });
  if (!original.ok) throw new Error("setup failed");
  const fixture = interactionFixture({
    actions: [{ kind: "edit", id: original.sub.id }],
    submission: {
      keyword: "(?i)Savage",
      dataCentres: ["Gaia", "Light"],
      categories: ["Trials", "Raids"],
      before: () =>
        expect(getStore().getSubscription(scopeA, original.sub.id)).toEqual(
          original.sub,
        ),
    },
  });
  await editCommand(fixture.interaction);
  expect(fixture.modals).toHaveLength(1);
  const [keyword, centres, categories] = formFields(fixture.modals[0]!);
  expect(keyword).toMatchObject({ value: "Ultimate" });
  expect(centres).toMatchObject({
    options: expect.arrayContaining([
      { label: "Mana (JP)", value: "Mana", default: true },
    ]),
  });
  expect(categories).toMatchObject({
    options: expect.arrayContaining([
      { label: "高难度任务", value: "HighEndDuty", default: true },
    ]),
  });
  expect(getStore().getSubscriptions(scopeA)).toEqual([
    {
      ...original.sub,
      keyword: "(?i)Savage",
      dataCentres: ["Gaia", "Light"],
      categories: ["Raids", "Trials"],
    },
  ]);
  expect(fixture.views[1]?.components).toEqual([]);
  expect(fixture.views.at(-1)?.content).toContain("成功在当前频道修改招募订阅");
  expect(
    fixture.deferred.every((reply) => reply.flags === MessageFlags.Ephemeral),
  ).toBe(true);
});

test("edit can preserve all prefilled values or clear both filter sets", async () => {
  const original = getStore().addSubscription(scopeA, "Extreme", "creator", {
    dataCentres: ["Mana"],
    categories: ["Trials"],
  });
  if (!original.ok) throw new Error("setup failed");
  const unchanged = interactionFixture({
    actions: [{ kind: "edit", id: original.sub.id }],
  });
  await editCommand(unchanged.interaction);
  expect(getStore().getSubscription(scopeA, original.sub.id)).toEqual(
    original.sub,
  );
  const cleared = interactionFixture({
    actions: [{ kind: "edit", id: original.sub.id }],
    submission: { dataCentres: [], categories: [] },
  });
  await editCommand(cleared.interaction);
  expect(getStore().getSubscription(scopeA, original.sub.id)).toEqual({
    ...original.sub,
    dataCentres: [],
    categories: [],
  });
});

test("edit closing or timeout preserves the original subscription", async () => {
  const original = getStore().addSubscription(scopeA, "Ultimate", "creator");
  if (!original.ok) throw new Error("setup failed");
  const fixture = interactionFixture({
    actions: [{ kind: "edit", id: original.sub.id }],
    submission: null,
  });
  await editCommand(fixture.interaction);
  expect(getStore().getSubscription(scopeA, original.sub.id)).toEqual(
    original.sub,
  );
  expect(fixture.views.at(-1)?.content).toContain("超时");
  expect(fixture.views[1]?.components).toEqual([]);
});

test("edit paginates and rejects foreign or off-page subscription IDs", async () => {
  for (let i = 0; i < 26; i++)
    getStore().addSubscription(scopeA, String(i), "creator");
  const last = getStore().getSubscriptionsPage(scopeA, 1, 25).subscriptions[0]!;
  const foreign = getStore().addSubscription(
    scopeB,
    "FOREIGN_SECRET",
    "foreign-user",
  );
  if (!foreign.ok) throw new Error("setup failed");
  for (const id of [foreign.sub.id, last.id]) {
    const rejected = interactionFixture({ actions: [{ kind: "edit", id }] });
    await editCommand(rejected.interaction);
    expect(rejected.modals).toEqual([]);
    expect(rejected.componentReplies[0]?.content).toContain("未找到");
    expect(JSON.stringify(rejected.views)).not.toContain("FOREIGN_SECRET");
  }
  const fixture = interactionFixture({
    actions: [{ kind: "next" }, { kind: "edit", id: last.id }],
    submission: { keyword: "UPDATED" },
  });
  await editCommand(fixture.interaction);
  expect(fixture.views[1]?.content).toContain("第 2/2 页");
  expect(getStore().getSubscription(scopeA, last.id)?.keyword).toBe("UPDATED");
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(26);
  expect(getStore().getSubscription(scopeB, foreign.sub.id)).toEqual(
    foreign.sub,
  );
});

test("edit rejects invalid or duplicate submitted conditions without changing data", async () => {
  const original = getStore().addSubscription(scopeA, "Ultimate", "creator");
  getStore().addSubscription(scopeA, "Savage", "another");
  if (!original.ok) throw new Error("setup failed");
  for (const submission of [
    { keyword: "[" },
    { dataCentres: ["toString"] },
    { categories: ["invalid"] },
    { keyword: "Savage" },
  ]) {
    const fixture = interactionFixture({
      actions: [{ kind: "edit", id: original.sub.id }],
      submission,
    });
    await editCommand(fixture.interaction);
    expect(fixture.views.at(-1)?.content).toMatch(/无效|已有相同/);
    expect(getStore().getSubscription(scopeA, original.sub.id)).toEqual(
      original.sub,
    );
  }
  expect(getStore().getSubscriptions(scopeA)).toHaveLength(2);
});

test("edit rechecks user permissions at selection and submission and bot permissions at save", async () => {
  const original = getStore().addSubscription(scopeA, "Ultimate", "creator");
  if (!original.ok) throw new Error("setup failed");
  const selectionRevoked = interactionFixture({
    actions: [
      {
        kind: "edit",
        id: original.sub.id,
        permissions: new PermissionsBitField(0n),
      },
    ],
  });
  await editCommand(selectionRevoked.interaction);
  expect(selectionRevoked.modals).toEqual([]);
  expect(selectionRevoked.views.at(-1)?.content).toContain("管理频道权限");
  const submitRevoked = interactionFixture({
    actions: [{ kind: "edit", id: original.sub.id }],
    submission: { keyword: "Savage", permissions: new PermissionsBitField(0n) },
  });
  await editCommand(submitRevoked.interaction);
  expect(submitRevoked.views.at(-1)?.content).toContain("管理频道权限");
  const botRevoked = interactionFixture({
    actions: [{ kind: "edit", id: original.sub.id }],
    submission: {
      keyword: "Savage",
      before: () => {
        botRevoked.control.permissions = new PermissionsBitField(0n);
      },
    },
  });
  await editCommand(botRevoked.interaction);
  expect(botRevoked.views.at(-1)?.content).toContain("机器人需要");
  expect(getStore().getSubscription(scopeA, original.sub.id)).toEqual(
    original.sub,
  );
});

test("edit handles deletion before selection or modal submission without recreating the subscription", async () => {
  for (const step of ["selection", "submission"]) {
    const original = getStore().addSubscription(scopeA, "Ultimate", "creator");
    if (!original.ok) throw new Error("setup failed");
    const fixture = interactionFixture({
      actions: [
        {
          kind: "edit",
          id: original.sub.id,
          before: () => {
            if (step === "selection")
              getStore().removeSubscription(scopeA, original.sub.id);
          },
        },
      ],
      submission: {
        keyword: "Savage",
        before: () => {
          if (step === "submission")
            getStore().removeSubscription(scopeA, original.sub.id);
        },
      },
    });
    await editCommand(fixture.interaction);
    expect(fixture.views.at(-1)?.content).toContain("未找到");
    expect(getStore().getSubscriptions(scopeA)).toEqual([]);
  }
});

test("edit handles an empty channel privately", async () => {
  const fixture = interactionFixture();
  await editCommand(fixture.interaction);
  expect(fixture.deferred[0]?.flags).toBe(MessageFlags.Ephemeral);
  expect(fixture.modals).toEqual([]);
  expect(fixture.views[0]?.content).toContain("没有任何招募订阅");
  expect(fixture.views[0]?.components).toEqual([]);
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
