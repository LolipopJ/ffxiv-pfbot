import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { type Locale, locale } from "../locales";
import { runSubscriptionPager } from "../services/subscription-pager";

export const data = new SlashCommandBuilder()
  .setName("edit")
  .setDescription(locale.messages.commands.edit)
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
  await runSubscriptionPager(interaction, "edit", language);
}
