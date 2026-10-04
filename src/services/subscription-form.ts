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

import { DATA_CENTRE_LABEL } from "../constants/recruitment";
import { type Locale, locale } from "../locales";
import type { Category } from "../types/recruitment";
import { getBotSendError, getCommandContext } from "../utils/channel";
import { logger } from "../utils/logger";
import { displaySubscriptionFilters } from "../utils/subscription";
import { displayPattern, truncate } from "../utils/text";
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
  language: Locale = locale,
) {
  const messages = language.messages.form;
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
    labels: Readonly<Record<string, string>>,
    selected: string[] = [],
  ) =>
    new LabelBuilder()
      .setLabel(truncate(label, 45))
      .setDescription(truncate(messages.multiSelect, 100))
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(language.messages.common.unlimited)
          .setRequired(false)
          .setMinValues(0)
          .setMaxValues(Object.keys(labels).length)
          .addOptions(
            Object.entries(labels).map(([value, label]) => ({
              label: truncate(label, 100),
              value,
              default: selected.includes(value),
            })),
          ),
      );
  return new ModalBuilder()
    .setCustomId(`${session}:subscription`)
    .setTitle(
      truncate(subscription ? messages.editTitle : messages.createTitle, 45),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(truncate(messages.pattern, 45))
        .setDescription(truncate(messages.patternDescription, 100))
        .setTextInputComponent(keyword),
      select(
        "data-centres",
        messages.dataCentres,
        DATA_CENTRE_LABEL,
        subscription?.dataCentres,
      ),
      select(
        "categories",
        messages.categories,
        language.categories,
        subscription?.categories,
      ),
    );
}

export async function runSubscriptionForm(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  subscription?: Subscription,
  onOpened?: () => Promise<unknown>,
  language: Locale = locale,
) {
  const messages = language.messages.form;
  const context = getCommandContext(interaction, language);
  if (!context.ok) {
    await interaction.reply({
      content: context.reason,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const session = randomUUID();
  await interaction.showModal(
    buildSubscriptionForm(session, subscription, language),
  );
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
      content: subscription ? messages.editTimeout : messages.createTimeout,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await submitted.deferReply({ flags: MessageFlags.Ephemeral });
  const currentContext = getCommandContext(submitted, language);
  if (!currentContext.ok) {
    await submitted.editReply({ content: currentContext.reason });
    return;
  }
  const keyword = submitted.fields.getTextInputValue("keyword");
  const keywordError = getKeywordError(keyword);
  if (keywordError) {
    await submitted.editReply({
      content: `❌ ${language.messages.errors[keywordError]}`,
    });
    return;
  }
  const filters = {
    dataCentres: [...submitted.fields.getStringSelectValues("data-centres")],
    categories: [
      ...submitted.fields.getStringSelectValues("categories"),
    ] as Category[],
  };
  const permissionError = await getBotSendError(
    currentContext.channel,
    language,
  );
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
    logger.info(
      "subscription",
      subscription ? "subscriptionEdited" : "subscriptionCreated",
      {
        ...context.scope,
        subscriptionId: result.sub.id,
        userId: interaction.user.id,
        keyword,
        dataCentres: result.sub.dataCentres,
        categories: result.sub.categories,
      },
    );
  }
  await submitted.editReply({
    content: result.ok
      ? truncate(
          (subscription ? messages.edited : messages.created)({
            pattern: displayPattern(keyword, 1000),
            filters: displaySubscriptionFilters(result.sub, 300, language),
            id: result.sub.id,
          }),
          2000,
        )
      : `❌ ${language.messages.errors[result.errorCode]}`,
    allowedMentions: { parse: [] },
  });
}
