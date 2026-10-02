import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";

import { getCommandContext } from "../utils/channel";
import { logger } from "../utils/logger";
import { displaySubscriptionFilters } from "../utils/subscription";
import { displayPattern, truncate } from "../utils/text";
import { formatCleanupResult, getCleanup } from "./cleanup";
import { type ChannelScope, getStore, SubscriptionStore } from "./store";
import { runSubscriptionForm } from "./subscription-form";

type PagerMode = "list" | "unsubscribe" | "edit" | "reset";

export function isPagerInteraction(
  interaction: MessageComponentInteraction,
  userId: string,
  scope: ChannelScope,
  session: string,
) {
  return (
    interaction.user.id === userId &&
    interaction.guildId === scope.guildId &&
    interaction.channelId === scope.channelId &&
    ["previous", "next", "delete", "edit", "reset"].some(
      (action) => interaction.customId === `${session}:${action}`,
    )
  );
}

export function buildSubscriptionPage(
  store: SubscriptionStore,
  scope: ChannelScope,
  page: number,
  mode: PagerMode,
  session: string,
) {
  const result = store.getSubscriptionsPage(
    scope,
    page,
    mode === "list" ? 5 : mode === "reset" ? 24 : 25,
  );
  const components: ActionRowBuilder<
    ButtonBuilder | StringSelectMenuBuilder
  >[] = [];
  let content =
    result.total === 0
      ? "ℹ️ 当前频道没有任何招募订阅。"
      : `📋 **当前频道招募订阅**（${result.total} 个）｜第 ${result.page + 1}/${result.pageCount} 页`;
  if (mode === "list") {
    content += result.subscriptions
      .map(
        (sub, index) =>
          `\n\n${result.page * 5 + index + 1}. ${displayPattern(sub.keyword)}\n${displaySubscriptionFilters(sub, 50).replace("\n", " ｜ ")}\nID: ${sub.id} ｜ 创建者: <@${sub.userId}>`,
      )
      .join("");
  } else if (result.total > 0 || mode === "reset") {
    content +=
      mode === "reset"
        ? "\n选择要强制清理的订阅：不检查招募期限，删除关联消息及投递记录，保留订阅配置；仍有效的招募可在下一轮重新推送。多个订阅共享的消息也会删除。"
        : `\n选择要${mode === "edit" ? "编辑" : "取消"}的招募订阅：`;
    const select = new StringSelectMenuBuilder()
      .setCustomId(
        `${session}:${mode === "reset" ? "reset" : mode === "edit" ? "edit" : "delete"}`,
      )
      .setPlaceholder("选择本页招募订阅")
      .addOptions(
        result.subscriptions.map((sub) => ({
          label: truncate(sub.keyword.replace(/\s+/g, " "), 90) || "（空正则）",
          description: truncate(
            displaySubscriptionFilters(sub).replace("\n", " ｜ "),
            100,
          ),
          value: sub.id,
        })),
      );
    if (mode === "reset") {
      select.addOptions({
        label: "全部订阅",
        description:
          "强制清理当前频道的所有招募消息及投递记录（包括已取消订阅的记录）",
        value: "all",
      });
    }
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
  }
  if (result.pageCount > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${session}:previous`)
          .setLabel("上一页")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(result.page === 0),
        new ButtonBuilder()
          .setCustomId(`${session}:next`)
          .setLabel("下一页")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(result.page === result.pageCount - 1),
      ),
    );
  }
  return {
    ...result,
    payload: { content, components, allowedMentions: { parse: [] as never[] } },
  };
}

export async function runSubscriptionPager(
  interaction: ChatInputCommandInteraction,
  mode: PagerMode,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const context = getCommandContext(interaction);
  if (!context.ok) {
    await interaction.editReply({ content: context.reason });
    return;
  }
  const store = getStore();
  const session = randomUUID();
  let page = (interaction.options.getInteger("page") ?? 1) - 1;
  let view = buildSubscriptionPage(store, context.scope, page, mode, session);
  const reply = await interaction.editReply(view.payload);
  const deadline = Date.now() + 120_000;
  while (view.payload.components.length > 0 && Date.now() < deadline) {
    let selection: MessageComponentInteraction;
    try {
      selection = await reply.awaitMessageComponent({
        filter: (candidate) =>
          isPagerInteraction(
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
    if (
      selection.isStringSelectMenu() &&
      selection.customId ===
        `${session}:${mode === "reset" ? "reset" : mode === "edit" ? "edit" : "delete"}` &&
      mode !== "list"
    ) {
      const id = selection.values[0];
      if (
        !id ||
        (!(mode === "reset" && id === "all") &&
          !view.subscriptions.some((sub) => sub.id === id))
      ) {
        await selection.reply({
          content: "❌️ 未找到该招募订阅或无权操作。",
          flags: MessageFlags.Ephemeral,
        });
        continue;
      }
      if (mode === "reset") {
        if (id !== "all" && !store.getSubscription(context.scope, id)) {
          await selection.update({
            content: "❌️ 未找到该招募订阅或无权操作。",
            components: [],
          });
          return;
        }
        await selection.deferUpdate();
        await interaction.editReply({
          content: "⏳ 正在强制清理…",
          components: [],
        });
        const result = await getCleanup(interaction.client).reset(
          context.scope,
          id === "all" ? undefined : id,
        );
        await interaction.editReply({
          content: formatCleanupResult(result),
          components: [],
        });
        return;
      }
      if (mode === "edit") {
        const subscription = store.getSubscription(context.scope, id);
        if (!subscription) {
          await selection.update({
            content: "❌️ 未找到该招募订阅或无权操作。",
            components: [],
          });
          return;
        }
        await runSubscriptionForm(selection, subscription, () =>
          interaction.editReply({
            content: "ℹ️ 请在弹窗中修改正则、数据中心和招募类别，提交后保存。",
            components: [],
          }),
        );
        return;
      }
      const removed = store.removeSubscription(context.scope, id);
      if (removed) {
        logger.info("订阅", "已取消招募订阅", {
          ...context.scope,
          subscriptionId: id,
          userId: interaction.user.id,
        });
      }
      await selection.update({
        content: removed
          ? "✅ 已取消该招募订阅。"
          : "❌️ 未找到该招募订阅或无权操作。",
        components: [],
      });
      return;
    }
    if (!selection.isButton()) {
      await selection.deferUpdate();
      continue;
    }
    page = view.page + (selection.customId === `${session}:next` ? 1 : -1);
    view = buildSubscriptionPage(store, context.scope, page, mode, session);
    await selection.update(view.payload);
  }
  await interaction.editReply({ components: [] });
}
