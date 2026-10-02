import type { Client } from "discord.js";

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

export function formatCleanupResult(result: CleanupResult) {
  return (
    `${result.failed || result.unlinked || result.fetchFailed ? "⚠️" : "✅"} 已清理 ${result.removed} 条消息及投递记录，失败 ${result.failed} 条（保留记录供重试）。订阅配置已保留。` +
    (result.fetchFailed ? "\n抓取失败，本次仅按数据库已记录的期限清理。" : "") +
    (result.unlinked
      ? `\n另有 ${result.unlinked} 条旧记录尚无订阅关联；可选择「全部订阅」清理。`
      : "")
  );
}

export function createCleanup(
  client: Client,
  store: SubscriptionStore,
  fetchListings: () => Promise<Recruitment[]> = getListings,
  now: () => number = Date.now,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  let pending = 0;
  const runner = getTaskRunner(client);
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
        logger.error("清理", "定时清理失败，下次重试", { error }),
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
          throw new Error("频道不可访问或与服务器不匹配");
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
            logger.info("清理", "已删除消息及投递记录", {
              guildId: delivery.guildId,
              channelId: delivery.channelId,
              listingId: delivery.listingId,
              messageId: delivery.messageId,
              force,
            });
          } catch (error) {
            result.failed++;
            logger.error("清理", "删除失败，保留投递记录等待重试", {
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
          logger.error("清理", "频道清理失败，保留记录等待重试", {
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
    if (stopped) return Promise.reject(new Error("清理服务已停止"));
    // Any manual/automatic invocation restarts the one-hour countdown after completion.
    cancelTimer();
    pending++;
    const job = runner
      .run("clearing", async () => {
        if (
          subscriptionId &&
          (!scope || !store.getSubscription(scope, subscriptionId))
        )
          throw new Error("未找到该招募订阅或无权操作。");
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
            logger.error("清理", "抓取失败，仅按数据库期限清理", { error });
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
        logger.info("清理", "清理完成", {
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
      logger.info("清理", "每小时清理任务已启动", {
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
