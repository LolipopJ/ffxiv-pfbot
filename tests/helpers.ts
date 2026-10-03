import {
  ChannelType,
  type Client,
  type GuildTextBasedChannel,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve, sep } from "path";

import type { ChannelScope } from "../src/services/store";
import type { Recruitment } from "../src/types/recruitment";

export const scopeA: ChannelScope = {
  guildId: "guild-A",
  channelId: "channel-A",
};
export const scopeB: ChannelScope = {
  guildId: "guild-A",
  channelId: "channel-B",
};
export const allPermissions = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
]);

export function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), "pfbot-test-"));
}

export function removeTemporaryDirectory(directory: string) {
  const target = resolve(directory);
  if (
    !target.startsWith(resolve(tmpdir()) + sep) ||
    !basename(target).startsWith("pfbot-test-")
  ) {
    throw new Error("Unexpected test cleanup path");
  }
  rmSync(target, { recursive: true, force: true });
}

export function listing(overrides: Partial<Recruitment> = {}): Recruitment {
  return {
    id: "123",
    duty: "Ultimate",
    description: "Practice",
    category: "HighEndDuty",
    dataCentre: "Mana",
    minIlvl: "780",
    slots: [{ filled: true, role: ["tank"], acceptedJobs: ["PLD"] }],
    current: 1,
    total: 8,
    creator: "Test @ World",
    world: "World",
    expires: "in an hour",
    updated: "now",
    rawText: "Ultimate Practice",
    ...overrides,
  };
}

export function fakeChannel(
  scope = scopeA,
  type: ChannelType = ChannelType.GuildText,
) {
  const sends: { id: string; payload: unknown }[] = [];
  const edits: { id: string; payload: unknown }[] = [];
  const deletes: string[] = [];
  const messageCache = new Map<string, unknown>();
  const control = {
    sendError: undefined as Error | undefined,
    editError: undefined as (Error & { code?: number }) | undefined,
    deleteError: undefined as (Error & { code?: number }) | undefined,
    permissions: allPermissions,
    archived: false,
    locked: false,
    timedOut: false,
    threadMemberError: undefined as (Error & { code?: number }) | undefined,
    threadMemberChecks: 0,
    async beforeSend() {},
  };
  const channel = {
    id: scope.channelId,
    guildId: scope.guildId,
    type,
    guild: {
      members: {
        fetchMe: async () => ({
          id: "bot",
          isCommunicationDisabled: () => control.timedOut,
        }),
      },
    },
    client: {
      rest: {
        get: async () => {
          control.threadMemberChecks++;
          if (control.threadMemberError) throw control.threadMemberError;
          return { user_id: "bot" };
        },
      },
    },
    isThread: () =>
      [
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      ].includes(type),
    get archived() {
      return control.archived;
    },
    get locked() {
      return control.locked;
    },
    permissionsFor: () => control.permissions,
    send: async (payload: unknown) => {
      await control.beforeSend();
      if (control.sendError) throw control.sendError;
      const message = { id: `message-${sends.length + 1}`, payload };
      sends.push(message);
      messageCache.set(message.id, message);
      return message;
    },
    messages: {
      cache: messageCache,
      delete: async (id: string) => {
        if (control.deleteError) throw control.deleteError;
        deletes.push(id);
      },
      edit: async (id: string, payload: unknown) => {
        if (control.editError) throw control.editError;
        edits.push({ id, payload });
        messageCache.set(id, { id, payload });
        return { id };
      },
    },
  } as unknown as GuildTextBasedChannel;
  return { channel, control, sends, edits, deletes, messageCache };
}

export function fakeClient(channels: GuildTextBasedChannel[]): Client {
  return {
    channels: {
      fetch: async (id: string) =>
        channels.find((channel) => channel.id === id) ?? null,
    },
  } as unknown as Client;
}
