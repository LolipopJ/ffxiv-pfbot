import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { type Locale, locale } from "../locales";
import { formatCleanupResult, getCleanup } from "../services/cleanup";
import { getCommandContext } from "../utils/channel";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription(locale.messages.commands.clear)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(
  interaction: ChatInputCommandInteraction,
  language: Locale = locale,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const context = getCommandContext(interaction, language);
  if (!context.ok) {
    await interaction.editReply({ content: context.reason });
    return;
  }
  const result = await getCleanup(interaction.client).clear(context.scope);
  await interaction.editReply({
    content: formatCleanupResult(result, language),
  });
}
