import { randomUUID } from "crypto";
import {
  type ChatInputCommandInteraction,
  LabelBuilder,
  type MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { CATEGORY_LABEL, DATA_CENTRE_LABEL } from "../locales/zh-cn";
import type { Category } from "../types/recruitment";
import { getBotSendError, getCommandContext } from "../utils/channel";
import { logger } from "../utils/logger";
import { displaySubscriptionFilters } from "../utils/subscription";
import { displayPattern } from "../utils/text";
import {
  type ChannelScope,
  getKeywordError,
  getStore,
  type Subscription,
} from "./store";

export function isSubscriptionInteraction(
  interaction: ModalSubmitInteraction,
  userId: string,
  scope: ChannelScope,
  session: string,
) {
  return (
    interaction.user.id === userId &&
    interaction.guildId === scope.guildId &&
    interaction.channelId === scope.channelId &&
    interaction.customId === `${session}:subscription`
  );
}

export function buildSubscriptionForm(
  session: string,
  subscription?: Subscription,
) {
  const keyword = new TextInputBuilder()
    .setCustomId("keyword")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("(?i)(Ultimate|Savage)")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(1000);
  if (subscription) keyword.setValue(subscription.keyword);
  const select = (
    customId: string,
    label: string,
    labels: Record<string, string>,
    selected: string[] = [],
  ) =>
    new LabelBuilder()
      .setLabel(label)
      .setDescription("可多选，留空表示不限")
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder("不限")
          .setRequired(false)
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
  return new ModalBuilder()
    .setCustomId(`${session}:subscription`)
    .setTitle(subscription ? "编辑招募订阅" : "创建招募订阅")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("正则表达式")
        .setDescription(
          "匹配招募英文标题和招募描述，使用 RE2 语法，长度 1–1000 字符",
        )
        .setTextInputComponent(keyword),
      select(
        "data-centres",
        "数据中心",
        DATA_CENTRE_LABEL,
        subscription?.dataCentres,
      ),
      select(
        "categories",
        "招募类别",
        CATEGORY_LABEL,
        subscription?.categories,
      ),
    );
}

export async function runSubscriptionForm(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  subscription?: Subscription,
  onOpened?: () => Promise<unknown>,
) {
  const context = getCommandContext(interaction);
  if (!context.ok) {
    await interaction.reply({
      content: context.reason,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const session = randomUUID();
  await interaction.showModal(buildSubscriptionForm(session, subscription));
  const pendingSubmit = interaction
    .awaitModalSubmit({
      filter: (candidate) =>
        isSubscriptionInteraction(
          candidate,
          interaction.user.id,
          context.scope,
          session,
        ),
      time: 120_000,
    })
    .catch(() => null);
  await onOpened?.();
  const submitted = await pendingSubmit;
  if (!submitted) {
    await interaction.followUp({
      content: subscription
        ? "ℹ️ 招募订阅编辑已超时，未修改订阅。"
        : "ℹ️ 招募订阅设置已超时，未创建订阅。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await submitted.deferReply({ flags: MessageFlags.Ephemeral });
  const currentContext = getCommandContext(submitted);
  if (!currentContext.ok) {
    await submitted.editReply({ content: currentContext.reason });
    return;
  }
  const keyword = submitted.fields.getTextInputValue("keyword");
  const keywordError = getKeywordError(keyword);
  if (keywordError) {
    await submitted.editReply({ content: `❌ ${keywordError}` });
    return;
  }
  const filters = {
    dataCentres: [...submitted.fields.getStringSelectValues("data-centres")],
    categories: [
      ...submitted.fields.getStringSelectValues("categories"),
    ] as Category[],
  };
  const permissionError = await getBotSendError(currentContext.channel);
  if (permissionError) {
    await submitted.editReply({ content: `❌ ${permissionError}` });
    return;
  }
  const store = getStore();
  const result = subscription
    ? store.updateSubscription(context.scope, subscription.id, keyword, filters)
    : store.addSubscription(
        context.scope,
        keyword,
        interaction.user.id,
        filters,
      );
  if (result.ok) {
    logger.info("订阅", subscription ? "已修改招募订阅" : "已创建招募订阅", {
      ...context.scope,
      subscriptionId: result.sub.id,
      userId: interaction.user.id,
      keyword,
      dataCentres: result.sub.dataCentres,
      categories: result.sub.categories,
    });
  }
  await submitted.editReply({
    content: result.ok
      ? `✅ 成功在当前频道${subscription ? "修改" : "创建"}招募订阅。\n匹配正则: ${displayPattern(keyword, 1000)}\n${displaySubscriptionFilters(result.sub)}\nID: ${result.sub.id}`
      : `❌ ${result.reason}`,
    allowedMentions: { parse: [] },
  });
}
