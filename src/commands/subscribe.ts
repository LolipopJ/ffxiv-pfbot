import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { getStore } from "../services/store";
import { getBotSendError, getCommandContext } from "../utils/channel";
import { displayPattern } from "../utils/text";

export const data = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription("订阅当前频道的招募推送")
  .addStringOption((option) =>
    option
      .setName("keyword")
      .setDescription("RE2 正则表达式，如 Ultimate|Savage|Extreme|Unreal")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1000),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const context = getCommandContext(interaction);
  if (!context.ok) {
    await interaction.editReply({ content: context.reason });
    return;
  }
  const permissionError = await getBotSendError(context.channel);
  if (permissionError) {
    await interaction.editReply({ content: `❌ ${permissionError}` });
    return;
  }
  const keyword = interaction.options.getString("keyword", true);
  const result = getStore().addSubscription(
    context.scope,
    keyword,
    interaction.user.id,
  );
  await interaction.editReply({
    content: result.ok
      ? `✅ 已订阅当前频道。\n正则: ${displayPattern(keyword, 1000)}\nID: ${result.sub.id}`
      : `❌ ${result.reason}`,
    allowedMentions: { parse: [] },
  });
}
