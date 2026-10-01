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
) {
  if (!interaction.inGuild() || !interaction.guildId) {
    return { ok: false as const, reason: "请在服务器频道中使用此命令。" };
  }
  const channel = interaction.channel;
  if (
    !isNotificationChannel(channel) ||
    channel.id !== interaction.channelId ||
    channel.guildId !== interaction.guildId
  ) {
    return {
      ok: false as const,
      reason: "仅支持当前文字频道、公告频道或线程。",
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
      reason: "你需要当前频道的查看频道和管理频道权限。",
    };
  }
  const scope: ChannelScope = {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  };
  return { ok: true as const, channel, scope };
}

export async function getBotSendError(channel: GuildTextBasedChannel) {
  if (channel.isThread() && (channel.archived || channel.locked)) {
    return "线程已归档或锁定，请先恢复线程。";
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
    return "机器人需要当前频道的查看频道、发送消息和嵌入链接权限。";
  }
  if (member.isCommunicationDisabled()) {
    return "机器人当前被禁言，请先解除禁言。";
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
        return "机器人无法访问此私密线程，请先将机器人加入线程并检查权限。";
      }
      throw error;
    }
  }
  return null;
}
