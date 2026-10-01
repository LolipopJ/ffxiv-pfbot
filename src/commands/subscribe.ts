import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { runSubscriptionForm } from "../services/subscription-form";

export const data = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription("在当前频道订阅招募推送")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  await runSubscriptionForm(interaction);
}
