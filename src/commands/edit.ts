import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { runSubscriptionPager } from "../services/subscription-pager";

export const data = new SlashCommandBuilder()
  .setName("edit")
  .setDescription("分页选择并编辑当前频道的招募订阅")
  .addIntegerOption((option) =>
    option.setName("page").setDescription("页码，默认第 1 页").setMinValue(1),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  await runSubscriptionPager(interaction, "edit");
}
