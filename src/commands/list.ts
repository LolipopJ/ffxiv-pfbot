import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { type Locale, locale } from "../locales";
import { runSubscriptionPager } from "../services/subscription-pager";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription(locale.messages.commands.list)
  .addIntegerOption((option) =>
    option
      .setName("page")
      .setDescription(locale.messages.commands.page)
      .setMinValue(1),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(
  interaction: ChatInputCommandInteraction,
  language: Locale = locale,
) {
  await runSubscriptionPager(interaction, "list", language);
}
