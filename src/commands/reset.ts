import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { runSubscriptionPager } from "../services/subscription-pager";

export const data = new SlashCommandBuilder()
  .setName("reset")
  .setDescription("强制清理当前频道指定或全部订阅的消息和投递记录")
  .addIntegerOption((option) =>
    option.setName("page").setDescription("页码，默认第 1 页").setMinValue(1),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  await runSubscriptionPager(interaction, "reset");
}
