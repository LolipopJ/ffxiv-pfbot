import type { Client } from "discord.js";

import { type Locale, locale } from "../locales";
import type { Recruitment } from "../types/recruitment";
import { isNotificationChannel } from "../utils/channel";
import { hasDiscordCode } from "../utils/discord-error";
import { logger } from "../utils/logger";
import { getListings } from "./fetcher";
import { refreshListingState } from "./listing-state";
import {
  type ChannelScope,
  getStore,
  type MonitorDelivery,
  type SubscriptionStore,
} from "./store";
import { getTaskRunner } from "./tasks";

export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface CleanupResult {
  removed: number;
  failed: number;
  unlinked: number;
  fetchFailed: boolean;
}

export interface CleanupSnapshot {
  listings?: ReadonlyMap<string, Recruitment>;
  fetchFailed: boolean;
}

export function formatCleanupResult(
  result: CleanupResult,
  language: Locale = locale,
) {
  const messages = language.messages.cleanup;
  return (
    `${result.failed || result.unlinked || result.fetchFailed ? "⚠️" : "✅"} ${messages.result(result)}` +
    (result.fetchFailed ? messages.fetchFailed : "") +
    (result.unlinked ? messages.unlinked({ count: result.unlinked }) : "")
  );
}

export function createCleanup(
  client: Client,
  store: SubscriptionStore,
  fetchListings: () => Promise<Recruitment[]> = getListings,
  now: () => number = Date.now,
  language: Locale = locale,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  let pending = 0;
  const runner = getTaskRunner(client, language);
  const jobs = new Set<Promise<CleanupResult>>();

  const cancelTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    cancelTimer();
    if (!running || pending > 0 || stopped) return;
    timer = setTimeout(() => {
      void clear().catch((error) =>
        logger.error("cleanup", "scheduledCleanupFailed", { error }),
      );
    }, CLEANUP_INTERVAL_MS);
  };

  const remove = async (
    deliveries: MonitorDelivery[],
    result: CleanupResult,
    shouldRemove: (delivery: MonitorDelivery) => boolean,
    force: boolean,
  ) => {
    const scopes = new Map<string, MonitorDelivery[]>();
    for (const delivery of deliveries) {
      const key = `${delivery.guildId}:${delivery.channelId}`;
      const group = scopes.get(key) ?? [];
      group.push(delivery);
      scopes.set(key, group);
    }
    for (const group of scopes.values()) {
      const scope = group[0]!;
      try {
        const channel = await client.channels.fetch(scope.channelId);
        if (
          !isNotificationChannel(channel) ||
          channel.guildId !== scope.guildId
        )
          throw new Error(language.messages.logs.errors.channelUnavailable);
        for (const delivery of group) {
          if (!shouldRemove(delivery)) continue;
          try {
            try {
              await channel.messages.delete(delivery.messageId);
            } catch (error) {
              if (!hasDiscordCode(error, 10008)) throw error;
            }
            // GuildMessages intent is disabled; evict the cache explicitly.
            channel.messages.cache.delete(delivery.messageId);
            store.removeDelivery(delivery, delivery.listingId, force);
            result.removed++;
            logger.info("cleanup", "deliveryDeleted", {
              guildId: delivery.guildId,
              channelId: delivery.channelId,
              listingId: delivery.listingId,
              messageId: delivery.messageId,
              force,
            });
          } catch (error) {
            result.failed++;
            logger.error("cleanup", "deleteFailed", {
              listingId: delivery.listingId,
              messageId: delivery.messageId,
              error,
            });
          }
        }
      } catch (error) {
        if (hasDiscordCode(error, 10003)) {
          // Discord confirms that the channel and all its messages are gone.
          for (const delivery of group) {
            store.removeDelivery(delivery, delivery.listingId, force);
            result.removed++;
          }
        } else {
          result.failed += group.filter(shouldRemove).length;
          logger.error("cleanup", "channelCleanupFailed", {
            guildId: scope.guildId,
            channelId: scope.channelId,
            error,
          });
        }
      }
    }
  };

  const run = (
    force: boolean,
    scope?: ChannelScope,
    subscriptionId?: string,
    snapshot?: CleanupSnapshot,
  ) => {
    if (stopped)
      return Promise.reject(
        new Error(language.messages.logs.errors.cleanupStopped),
      );
    // Any manual/automatic invocation restarts the one-hour countdown after completion.
    cancelTimer();
    pending++;
    const job = runner
      .run("clearing", async () => {
        if (
          subscriptionId &&
          (!scope || !store.getSubscription(scope, subscriptionId))
        )
          throw new Error(language.messages.errors.SUBSCRIPTION_NOT_FOUND);
        const result: CleanupResult = {
          removed: 0,
          failed: 0,
          unlinked: 0,
          fetchFailed: snapshot?.fetchFailed ?? false,
        };
        let listings = snapshot?.listings;
        if (
          !snapshot &&
          !force &&
          (store.getMonitorDeliveries().length > 0 ||
            store.getExpiredListingIds().length > 0)
        ) {
          try {
            listings = new Map(
              (await fetchListings()).map((listing) => [listing.id, listing]),
            );
          } catch (error) {
            result.fetchFailed = true;
            logger.error("cleanup", "cleanupFetchFailed", { error });
          }
          refreshListingState(store, listings, now());
        }
        let deliveries = scope
          ? store.getChannelDeliveries(scope)
          : store.getMonitorDeliveries();
        if (subscriptionId) {
          deliveries = deliveries.filter((delivery) => {
            const ids = store.getDeliverySubscriptionIds(
              delivery,
              delivery.listingId,
            );
            if (ids.length === 0) result.unlinked++;
            return ids.includes(subscriptionId);
          });
        }
        await remove(
          deliveries,
          result,
          (delivery) => {
            if (force) return true;
            const expired = delivery.expiresAt <= now();
            if (expired && (!listings || listings.has(delivery.listingId)))
              store.markListingExpired(
                delivery.listingId,
                delivery.expiresAt,
                now(),
              );
            return (
              expired ||
              (listings !== undefined && !listings.has(delivery.listingId))
            );
          },
          force,
        );
        logger.info("cleanup", "cleanupComplete", {
          force,
          ...scope,
          subscriptionId,
          ...result,
        });
        return result;
      })
      .finally(() => {
        pending--;
        jobs.delete(job);
        schedule();
      });
    jobs.add(job);
    return job;
  };
  const clear = (scope?: ChannelScope) => run(false, scope);
  return {
    clear,
    // Monitor refreshes deadlines and fills this snapshot before this queued task runs.
    clearAfterMonitor: (snapshot: CleanupSnapshot) =>
      run(false, undefined, undefined, snapshot),
    idle: () => Promise.allSettled([...jobs]),
    reset: (scope: ChannelScope, subscriptionId?: string) =>
      run(true, scope, subscriptionId),
    start() {
      if (stopped || running) return;
      running = true;
      schedule();
      logger.info("cleanup", "cleanupStarted", {
        intervalMs: CLEANUP_INTERVAL_MS,
      });
    },
    async stop() {
      stopped = true;
      running = false;
      cancelTimer();
      await Promise.allSettled([...jobs]);
    },
  };
}

const cleanups = new WeakMap<Client, ReturnType<typeof createCleanup>>();

export function getCleanup(client: Client) {
  let cleanup = cleanups.get(client);
  if (!cleanup) {
    cleanup = createCleanup(client, getStore());
    cleanups.set(client, cleanup);
  }
  return cleanup;
}
