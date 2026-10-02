import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { formatCleanupResult, getCleanup } from "../services/cleanup";
import { getCommandContext } from "../utils/channel";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("清理当前频道已结束招募的消息和投递记录")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const context = getCommandContext(interaction);
  if (!context.ok) {
    await interaction.editReply({ content: context.reason });
    return;
  }
  const result = await getCleanup(interaction.client).clear(context.scope);
  await interaction.editReply({ content: formatCleanupResult(result) });
}
