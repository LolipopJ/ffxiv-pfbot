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
import { displaySubscriptionFilters } from "../utils/subscription";
import { displayPattern, truncate } from "../utils/text";
import { type ChannelScope, getStore, SubscriptionStore } from "./store";

type PagerMode = "list" | "unsubscribe";

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
    ["previous", "next", "delete"].some(
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
    mode === "list" ? 5 : 25,
  );
  const components: ActionRowBuilder<
    ButtonBuilder | StringSelectMenuBuilder
  >[] = [];
  let content =
    result.total === 0
      ? "ℹ️ 当前频道没有任何订阅。"
      : `📋 **当前频道订阅**（${result.total} 个）｜第 ${result.page + 1}/${result.pageCount} 页`;
  if (mode === "list") {
    content += result.subscriptions
      .map(
        (sub, index) =>
          `\n\n${result.page * 5 + index + 1}. ${displayPattern(sub.keyword)}\n${displaySubscriptionFilters(sub, 50).replace("\n", " ｜ ")}\nID: ${sub.id} ｜ 创建者: <@${sub.userId}>`,
      )
      .join("");
  } else if (result.total > 0) {
    content += "\n选择要取消的订阅：";
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${session}:delete`)
      .setPlaceholder("选择本页订阅")
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
    if (selection.isStringSelectMenu() && mode === "unsubscribe") {
      const id = selection.values[0];
      if (!id || !view.subscriptions.some((sub) => sub.id === id)) {
        await selection.reply({
          content: "未找到该订阅或无权操作。",
          flags: MessageFlags.Ephemeral,
        });
        continue;
      }
      const removed = store.removeSubscription(context.scope, id);
      await selection.update({
        content: removed ? "✅ 已取消订阅。" : "未找到该订阅或无权操作。",
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
