import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { type Locale, locale } from "../locales";
import { runSubscriptionForm } from "../services/subscription-form";

export const data = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription(locale.messages.commands.subscribe)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(
  interaction: ChatInputCommandInteraction,
  language: Locale = locale,
) {
  await runSubscriptionForm(interaction, undefined, undefined, language);
}
