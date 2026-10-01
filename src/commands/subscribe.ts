import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

import { CategoryLabel, DataCentre } from "../constants";
import {
  type ChannelScope,
  getKeywordError,
  getStore,
  type SubscriptionFilters,
} from "../services/store";
import type { Category } from "../types/recruitment";
import { getBotSendError, getCommandContext } from "../utils/channel";
import { displaySubscriptionFilters } from "../utils/subscription";
import { displayPattern } from "../utils/text";

export const data = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription("订阅当前频道的招募推送")
  .addStringOption((option) =>
    option
      .setName("keyword")
      .setDescription(
        "匹配任务名和招募描述的 RE2 正则表达式，如 (?i)(?:バイト|報酬|傭兵|merc|[0-9０-９]+[万萬m])",
      )
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1000),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export function isSubscriptionInteraction(
  interaction: MessageComponentInteraction,
  userId: string,
  scope: ChannelScope,
  session: string,
) {
  return (
    interaction.user.id === userId &&
    interaction.guildId === scope.guildId &&
    interaction.channelId === scope.channelId &&
    ((interaction.isStringSelectMenu() &&
      ["data-centres", "categories"].some(
        (action) => interaction.customId === `${session}:${action}`,
      )) ||
      (interaction.isButton() &&
        ["confirm", "cancel"].some(
          (action) => interaction.customId === `${session}:${action}`,
        )))
  );
}

export function buildSubscriptionForm(
  session: string,
  keyword: string,
  filters: SubscriptionFilters,
) {
  const select = (
    action: string,
    placeholder: string,
    labels: Record<string, string>,
    selected: string[] = [],
  ) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${session}:${action}`)
        .setPlaceholder(placeholder)
        .setMinValues(0)
        .setMaxValues(Object.keys(labels).length)
        .addOptions(
          Object.entries(labels).map(([value, label]) => ({
            label,
            value,
            default: selected.includes(value),
          })),
        ),
    );
  return {
    content: `选择筛选条件后点击「确认订阅」，留空表示不限。\n正则: ${displayPattern(keyword, 1000)}\n${displaySubscriptionFilters(filters)}`,
    components: [
      select(
        "data-centres",
        "数据中心（可多选）",
        DataCentre,
        filters.dataCentres,
      ),
      select(
        "categories",
        "招募类别（可多选）",
        CategoryLabel,
        filters.categories,
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${session}:confirm`)
          .setLabel("确认订阅")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${session}:cancel`)
          .setLabel("取消")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] as never[] },
  };
}

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
  const keywordError = getKeywordError(keyword);
  if (keywordError) {
    await interaction.editReply({ content: `❌ ${keywordError}` });
    return;
  }
  const session = randomUUID();
  const filters: SubscriptionFilters = { dataCentres: [], categories: [] };
  const reply = await interaction.editReply(
    buildSubscriptionForm(session, keyword, filters),
  );
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    let selection: MessageComponentInteraction;
    try {
      selection = await reply.awaitMessageComponent({
        filter: (candidate) =>
          isSubscriptionInteraction(
            candidate,
            interaction.user.id,
            context.scope,
            session,
          ),
        time: Math.max(1, deadline - Date.now()),
      });
    } catch {
      break;
    }
    const currentContext = getCommandContext(selection);
    if (!currentContext.ok) {
      await selection.update({
        content: currentContext.reason,
        components: [],
      });
      return;
    }
    if (selection.isStringSelectMenu()) {
      const isCentre = selection.customId === `${session}:data-centres`;
      const labels = isCentre ? DataCentre : CategoryLabel;
      if (selection.values.some((value) => !Object.hasOwn(labels, value))) {
        await selection.reply({
          content: "❌ 无效的筛选条件，请重新选择。",
          flags: MessageFlags.Ephemeral,
        });
        continue;
      }
      if (isCentre) filters.dataCentres = selection.values;
      else filters.categories = selection.values as Category[];
      await selection.update(buildSubscriptionForm(session, keyword, filters));
      continue;
    }
    if (selection.customId === `${session}:cancel`) {
      await selection.update({
        content: "ℹ️ 已取消，未创建订阅。",
        components: [],
      });
      return;
    }
    await selection.deferUpdate();
    const currentPermissionError = await getBotSendError(
      currentContext.channel,
    );
    if (currentPermissionError) {
      await interaction.editReply({
        content: `❌ ${currentPermissionError}`,
        components: [],
      });
      return;
    }
    const result = getStore().addSubscription(
      context.scope,
      keyword,
      interaction.user.id,
      filters,
    );
    await interaction.editReply({
      content: result.ok
        ? `✅ 已订阅当前频道。\n正则: ${displayPattern(keyword, 1000)}\n${displaySubscriptionFilters(result.sub)}\nID: ${result.sub.id}`
        : `❌ ${result.reason}`,
      components: [],
      allowedMentions: { parse: [] },
    });
    return;
  }
  await interaction.editReply({
    content: "ℹ️ 订阅设置已超时，未创建订阅。",
    components: [],
  });
}
