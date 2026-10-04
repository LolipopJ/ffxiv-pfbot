import {
  type Channel,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  Routes,
} from "discord.js";

import { type Locale, locale } from "../locales";
import type { ChannelScope } from "../services/store";

export function isNotificationChannel(
  channel: Channel | null,
): channel is GuildTextBasedChannel {
  return (
    channel !== null &&
    [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ].includes(channel.type)
  );
}

export function getCommandContext(
  interaction:
    | ChatInputCommandInteraction
    | MessageComponentInteraction
    | ModalSubmitInteraction,
  language: Locale = locale,
) {
  if (!interaction.inGuild() || !interaction.guildId) {
    return { ok: false as const, reason: language.messages.errors.guildOnly };
  }
  const channel = interaction.channel;
  if (
    !isNotificationChannel(channel) ||
    channel.id !== interaction.channelId ||
    channel.guildId !== interaction.guildId
  ) {
    return {
      ok: false as const,
      reason: language.messages.errors.channelOnly,
    };
  }
  if (
    !interaction.memberPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageChannels,
    ])
  ) {
    return {
      ok: false as const,
      reason: language.messages.errors.userPermissions,
    };
  }
  const scope: ChannelScope = {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  };
  return { ok: true as const, channel, scope };
}

export async function getBotSendError(
  channel: GuildTextBasedChannel,
  language: Locale = locale,
) {
  if (channel.isThread() && (channel.archived || channel.locked)) {
    return language.messages.errors.threadClosed;
  }
  const member = await channel.guild.members.fetchMe({ force: true });
  const sendPermission = channel.isThread()
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages;
  const permissions = channel.permissionsFor(member);
  if (
    !permissions?.has([
      PermissionFlagsBits.ViewChannel,
      sendPermission,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    return language.messages.errors.botPermissions;
  }
  if (member.isCommunicationDisabled()) {
    return language.messages.errors.botTimedOut;
  }
  if (
    channel.type === ChannelType.PrivateThread &&
    !permissions.has(PermissionFlagsBits.ManageThreads)
  ) {
    try {
      // Query this member directly; parent permissions alone do not grant private-thread access.
      await channel.client.rest.get(
        Routes.threadMembers(channel.id, member.id),
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        [10003, 10007, 50001, 50013].includes(Number(error.code))
      ) {
        return language.messages.errors.privateThread;
      }
      throw error;
    }
  }
  return null;
}
