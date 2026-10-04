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

import { type Locale, locale } from "../locales";
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
  language: Locale = locale,
) {
  const messages = language.messages.pager;
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
      ? messages.empty
      : messages.summary({
          total: result.total,
          page: result.page + 1,
          pageCount: result.pageCount,
        });
  if (mode === "list") {
    content += result.subscriptions
      .map((sub, index) => {
        const pattern = Array.from(sub.keyword.replace(/\s+/g, " "));
        return messages.item({
          index: result.page * 5 + index + 1,
          pattern: displayPattern(
            pattern.slice(0, 50).join("") + (pattern.length > 50 ? "..." : ""),
          ),
          filters: displaySubscriptionFilters(sub, 50, language).replace(
            "\n",
            " ｜ ",
          ),
          id: sub.id,
          userId: sub.userId,
        });
      })
      .join("");
  } else if (result.total > 0 || mode === "reset") {
    content +=
      mode === "reset"
        ? messages.selectReset
        : mode === "edit"
          ? messages.selectEdit
          : messages.selectDelete;
    const select = new StringSelectMenuBuilder()
      .setCustomId(
        `${session}:${mode === "reset" ? "reset" : mode === "edit" ? "edit" : "delete"}`,
      )
      .setPlaceholder(truncate(messages.placeholder, 150))
      .addOptions(
        result.subscriptions.map((sub) => ({
          label:
            truncate(sub.keyword.replace(/\s+/g, " "), 90) ||
            messages.emptyPattern,
          description: truncate(
            displaySubscriptionFilters(sub, Infinity, language).replace(
              "\n",
              " ｜ ",
            ),
            100,
          ),
          value: sub.id,
        })),
      );
    if (mode === "reset") {
      select.addOptions({
        label: truncate(messages.all, 100),
        description: truncate(messages.allDescription, 100),
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
          .setLabel(truncate(messages.previous, 80))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(result.page === 0),
        new ButtonBuilder()
          .setCustomId(`${session}:next`)
          .setLabel(truncate(messages.next, 80))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(result.page === result.pageCount - 1),
      ),
    );
  }
  return {
    ...result,
    payload: {
      content: truncate(content, 2000),
      components,
      allowedMentions: { parse: [] as never[] },
    },
  };
}

export async function runSubscriptionPager(
  interaction: ChatInputCommandInteraction,
  mode: PagerMode,
  language: Locale = locale,
) {
  const messages = language.messages.pager;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const context = getCommandContext(interaction, language);
  if (!context.ok) {
    await interaction.editReply({ content: context.reason });
    return;
  }
  const store = getStore();
  const session = randomUUID();
  let page = (interaction.options.getInteger("page") ?? 1) - 1;
  let view = buildSubscriptionPage(
    store,
    context.scope,
    page,
    mode,
    session,
    language,
  );
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
    const currentContext = getCommandContext(selection, language);
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
          content: `❌️ ${language.messages.errors.SUBSCRIPTION_NOT_FOUND}`,
          flags: MessageFlags.Ephemeral,
        });
        continue;
      }
      if (mode === "reset") {
        if (id !== "all" && !store.getSubscription(context.scope, id)) {
          await selection.update({
            content: `❌️ ${language.messages.errors.SUBSCRIPTION_NOT_FOUND}`,
            components: [],
          });
          return;
        }
        await selection.deferUpdate();
        await interaction.editReply({
          content: messages.resetting,
          components: [],
        });
        const result = await getCleanup(interaction.client).reset(
          context.scope,
          id === "all" ? undefined : id,
        );
        await interaction.editReply({
          content: formatCleanupResult(result, language),
          components: [],
        });
        return;
      }
      if (mode === "edit") {
        const subscription = store.getSubscription(context.scope, id);
        if (!subscription) {
          await selection.update({
            content: `❌️ ${language.messages.errors.SUBSCRIPTION_NOT_FOUND}`,
            components: [],
          });
          return;
        }
        await runSubscriptionForm(
          selection,
          subscription,
          () =>
            interaction.editReply({
              content: messages.editOpened,
              components: [],
            }),
          language,
        );
        return;
      }
      const removed = store.removeSubscription(context.scope, id);
      if (removed) {
        logger.info("subscription", "subscriptionCancelled", {
          ...context.scope,
          subscriptionId: id,
          userId: interaction.user.id,
        });
      }
      await selection.update({
        content: removed
          ? messages.cancelled
          : `❌️ ${language.messages.errors.SUBSCRIPTION_NOT_FOUND}`,
        components: [],
      });
      return;
    }
    if (!selection.isButton()) {
      await selection.deferUpdate();
      continue;
    }
    page = view.page + (selection.customId === `${session}:next` ? 1 : -1);
    view = buildSubscriptionPage(
      store,
      context.scope,
      page,
      mode,
      session,
      language,
    );
    await selection.update(view.payload);
  }
  await interaction.editReply({ components: [] });
}
