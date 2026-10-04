import { createHash } from "crypto";
import type { Client } from "discord.js";
import { RE2JS } from "re2js";

import { type Locale, locale } from "../locales";
import type { Recruitment } from "../types/recruitment";
import { getBotSendError, isNotificationChannel } from "../utils/channel";
import { hasDiscordCode } from "../utils/discord-error";
import { buildListingEmbed, field } from "../utils/embed";
import { LISTING_LIFETIME_MS } from "../utils/listing-time";
import { logger } from "../utils/logger";
import { displayPattern } from "../utils/text";
import { type CleanupSnapshot, createCleanup, getCleanup } from "./cleanup";
import { getListings } from "./fetcher";
import { refreshListingState } from "./listing-state";
import { type ChannelScope, getStore, SubscriptionStore } from "./store";
import { getTaskRunner } from "./tasks";

export function buildNotification(
  listing: Recruitment,
  patterns: string[],
  observedAt = Date.now(),
  language: Locale = locale,
) {
  const embed = buildListingEmbed(listing, observedAt, language).setFooter({
    text: field(
      `${patterns.map((pattern) => displayPattern(pattern)).join(", ")}`,
      512,
    ),
  });

  const stableEmbed = embed.toJSON();
  delete stableEmbed.timestamp;
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ embed: stableEmbed }))
    .digest("hex");
  return {
    payload: {
      embeds: [embed],
      allowedMentions: { parse: [] as never[] },
    },
    payloadHash,
  };
}

export function createMonitor(
  client: Client,
  store: SubscriptionStore,
  fetchListings: () => Promise<Recruitment[]> = getListings,
  now: () => number = Date.now,
  cleanup = createCleanup(client, store, fetchListings, now),
  language: Locale = locale,
) {
  let inFlight: Promise<void> | undefined;

  const notify = async (snapshot: CleanupSnapshot) => {
    const startedAt = now();
    const stats = { sent: 0, edited: 0, failed: 0 };
    const scopes = new Map<string, ChannelScope>();
    for (const sub of store.getMonitorSubscriptions()) {
      scopes.set(`${sub.guildId}:${sub.channelId}`, {
        guildId: sub.guildId,
        channelId: sub.channelId,
      });
    }
    if (
      scopes.size === 0 &&
      store.getMonitorDeliveries().length === 0 &&
      store.getExpiredListingIds().length === 0
    ) {
      logger.info("monitor", "monitorSkipped");
      return;
    }
    let listings: Map<string, Recruitment> | undefined;
    try {
      // One page can contain multiple copies of the same recruitment.
      listings = new Map(
        (await fetchListings()).map((listing) => [listing.id, listing]),
      );
      snapshot.listings = listings;
    } catch (error) {
      stats.failed++;
      snapshot.fetchFailed = true;
      logger.error("monitor", "monitorFetchFailed", {
        error,
      });
    }
    const observedAt = now();
    const { listingExpiries, expiredListingIds, isListingExpired } =
      refreshListingState(store, listings, observedAt);
    if (!listings) return;
    for (const scope of scopes.values()) {
      try {
        const channel = await client.channels.fetch(scope.channelId);
        if (
          !isNotificationChannel(channel) ||
          channel.guildId !== scope.guildId
        ) {
          logger.warn("monitor", "channelUnavailable", { ...scope });
          continue;
        }
        if (store.getSubscriptions(scope).length === 0) continue;
        const permissionError = await getBotSendError(channel);
        if (permissionError) {
          logger.warn("monitor", "channelCannotSend", {
            ...scope,
            reason: permissionError,
          });
          continue;
        }
        const subscriptions = store.getSubscriptions(scope).flatMap((sub) => {
          try {
            return [{ sub, regex: RE2JS.compile(sub.keyword) }];
          } catch {
            logger.warn("monitor", "invalidPatternSkipped", {
              ...scope,
              subscriptionId: sub.id,
            });
            return [];
          }
        });
        for (const listing of listings.values()) {
          if (isListingExpired(listing.id, now())) continue;
          const activeIds = new Set(
            store.getSubscriptions(scope).map((sub) => sub.id),
          );
          const matches = subscriptions.filter(
            ({ sub, regex }) =>
              activeIds.has(sub.id) &&
              (sub.dataCentres.length === 0 ||
                sub.dataCentres.includes(listing.dataCentre)) &&
              (sub.categories.length === 0 ||
                sub.categories.includes(listing.category)) &&
              regex.test(listing.rawText),
          );
          if (matches.length === 0) continue;
          const patterns = matches.map(({ sub }) => sub.keyword).sort();
          const subscriptionIds = matches.map(({ sub }) => sub.id);
          try {
            const { payload, payloadHash } = buildNotification(
              listing,
              [...new Set(patterns)],
              observedAt,
              language,
            );
            const previous = store.getDelivery(scope, listing.id);
            const expiresAt =
              listingExpiries.get(listing.id) ??
              previous?.expiresAt ??
              observedAt + LISTING_LIFETIME_MS;
            const checkedAt = now();
            if (expiresAt <= checkedAt) {
              isListingExpired(listing.id, checkedAt);
              continue;
            }
            if (previous?.payloadHash === payloadHash) {
              store.setDeliverySubscriptions(
                scope,
                listing.id,
                subscriptionIds,
              );
              continue;
            }
            if (previous) {
              try {
                await channel.messages.edit(previous.messageId, payload);
                store.saveDelivery(
                  scope,
                  listing.id,
                  {
                    messageId: previous.messageId,
                    payloadHash,
                    updatedAt: observedAt,
                    expiresAt,
                  },
                  subscriptionIds,
                );
                stats.edited++;
                logger.info("monitor", "listingUpdated", {
                  ...scope,
                  listingId: listing.id,
                  messageId: previous.messageId,
                });
                continue;
              } catch (error) {
                // Only a deleted message permits replacement; permission/network errors retry later.
                if (!hasDiscordCode(error, 10008)) throw error;
              }
            }
            // An edit returning Unknown Message can itself cross the deadline.
            if (isListingExpired(listing.id, now()) || expiresAt <= now())
              continue;
            // Discord's short-lived nonce deduplication also covers an immediate retry
            // when a send was accepted but its response was lost.
            const nonce = createHash("sha256")
              .update(
                `${scope.guildId}:${scope.channelId}:${listing.id}:${previous?.messageId ?? "new"}:${store.getDeliveryNonceVersion(scope, listing.id)}`,
              )
              .digest("hex")
              .slice(0, 24);
            const message = await channel.send({
              ...payload,
              nonce,
              enforceNonce: true,
            });
            // Synchronous commit immediately after a successful send/edit.
            store.saveDelivery(
              scope,
              listing.id,
              {
                messageId: message.id,
                payloadHash,
                updatedAt: observedAt,
                expiresAt,
              },
              subscriptionIds,
            );
            stats.sent++;
            logger.info("monitor", "listingSent", {
              ...scope,
              listingId: listing.id,
              messageId: message.id,
            });
          } catch (error) {
            stats.failed++;
            logger.error("monitor", "deliveryFailed", {
              ...scope,
              listingId: listing.id,
              error,
            });
          }
        }
      } catch (error) {
        stats.failed++;
        logger.error("monitor", "channelProcessingFailed", {
          ...scope,
          error,
        });
      }
    }
    logger.info("monitor", "monitorComplete", {
      channels: scopes.size,
      listings: listings?.size ?? null,
      expiredListings: expiredListingIds.size,
      ...stats,
      durationMs: now() - startedAt,
    });
  };

  return {
    check(): Promise<void> {
      if (inFlight) return inFlight;
      const snapshot: CleanupSnapshot = { fetchFailed: false };
      const monitoring = getTaskRunner(client)
        .run("fetching", () => notify(snapshot))
        .catch((error) => {
          logger.error("monitor", "monitorFailed", { error });
        });
      // Queue both phases now so cleanup stays adjacent and shutdown drains both.
      const clearing = cleanup.clearAfterMonitor(snapshot).catch((error) => {
        logger.error("cleanup", "monitorCleanupFailed", { error });
      });
      return (inFlight = Promise.all([monitoring, clearing])
        .then(() => {})
        .finally(() => {
          inFlight = undefined;
        }));
    },
    idle() {
      return inFlight ?? Promise.resolve();
    },
  };
}

export function startMonitor(client: Client) {
  const monitor = createMonitor(
    client,
    getStore(),
    getListings,
    Date.now,
    getCleanup(client),
  );
  const cronExpr = getTaskRunner(client).cron;
  const job = Bun.cron(cronExpr, () => monitor.check());
  const initialCheck = setTimeout(() => void monitor.check(), 5000);
  logger.info("monitor", "monitorStarted", {
    cron: cronExpr,
    initialDelayMs: 5000,
  });
  return async () => {
    job.stop();
    clearTimeout(initialCheck);
    await monitor.idle();
    logger.info("monitor", "monitorStopped");
  };
}
