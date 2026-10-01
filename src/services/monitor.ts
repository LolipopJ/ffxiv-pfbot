import { createHash } from "crypto";
import type { Client } from "discord.js";
import { RE2JS } from "re2js";

import type { Recruitment } from "../types/recruitment";
import { getBotSendError, isNotificationChannel } from "../utils/channel";
import { buildListingEmbed, field } from "../utils/embed";
import {
  getListingExpiresAt,
  LISTING_LIFETIME_MS,
} from "../utils/listing-time";
import { logger } from "../utils/logger";
import { displayPattern } from "../utils/text";
import { getListings } from "./fetcher";
import {
  type ChannelScope,
  getStore,
  type MonitorDelivery,
  SubscriptionStore,
} from "./store";

function isMissingMessage(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 10008
  );
}

export function buildNotification(
  listing: Recruitment,
  patterns: string[],
  observedAt = Date.now(),
) {
  const embed = buildListingEmbed(listing, observedAt).setFooter({
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
) {
  let inFlight: Promise<void> | undefined;

  const notify = async () => {
    const startedAt = now();
    const stats = { sent: 0, edited: 0, removed: 0, failed: 0 };
    const scopes = new Map<string, ChannelScope>();
    const deliveriesByScope = new Map<string, MonitorDelivery[]>();
    // Suppression survives restart, but a renewed website deadline reactivates the ID.
    const expiredListingIds = new Set(store.getExpiredListingIds());
    for (const sub of store.getMonitorSubscriptions()) {
      scopes.set(`${sub.guildId}:${sub.channelId}`, {
        guildId: sub.guildId,
        channelId: sub.channelId,
      });
    }
    const allDeliveries = store.getMonitorDeliveries();
    for (const delivery of allDeliveries) {
      const key = `${delivery.guildId}:${delivery.channelId}`;
      scopes.set(key, {
        guildId: delivery.guildId,
        channelId: delivery.channelId,
      });
      const deliveries = deliveriesByScope.get(key) ?? [];
      deliveries.push(delivery);
      deliveriesByScope.set(key, deliveries);
    }
    if (scopes.size === 0 && expiredListingIds.size === 0) {
      logger.info("监控", "本轮无需检查，没有订阅或待清理的投递记录");
      return;
    }
    let listings: Map<string, Recruitment> | undefined;
    try {
      // One page can contain multiple copies of the same recruitment.
      listings = new Map(
        (await fetchListings()).map((listing) => [listing.id, listing]),
      );
    } catch (error) {
      stats.failed++;
      logger.error(
        "监控",
        "抓取招募失败，本轮仅清理数据库已到期记录，下次检查重试",
        { error },
      );
    }
    const observedAt = now();
    const listingExpiries = new Map<string, number | null>();
    if (listings) {
      for (const listing of listings.values()) {
        const expiresAt = getListingExpiresAt(listing.expires, observedAt);
        listingExpiries.set(listing.id, expiresAt);
        if (expiresAt === null) {
          logger.warn(
            "监控",
            "无法解析招募期限，保留已有期限；新投递按观察后 1 小时到期",
            {
              listingId: listing.id,
              expires: listing.expires,
            },
          );
        }
      }
      for (const id of expiredListingIds) {
        const expiresAt = listingExpiries.get(id);
        if (
          !listings.has(id) ||
          (expiresAt != null && expiresAt > observedAt)
        ) {
          store.removeExpiredListing(id);
          expiredListingIds.delete(id);
        }
      }
      // Refresh before cleanup, including unchanged payloads and inaccessible channels.
      if (allDeliveries.length > 0)
        store.refreshMonitorDeliveries(listingExpiries, observedAt);
      for (const delivery of allDeliveries) {
        if (!listings.has(delivery.listingId)) continue;
        delivery.updatedAt = observedAt;
        delivery.expiresAt =
          listingExpiries.get(delivery.listingId) ?? delivery.expiresAt;
      }
    }
    // Persist expiry before any Discord deletion, even for inaccessible channels.
    // All scopes see the same suppression state regardless of their processing order.
    for (const delivery of allDeliveries) {
      if (
        delivery.expiresAt <= observedAt &&
        (!listings || listings.has(delivery.listingId)) &&
        !expiredListingIds.has(delivery.listingId)
      ) {
        store.markListingExpired(
          delivery.listingId,
          delivery.expiresAt,
          observedAt,
        );
        expiredListingIds.add(delivery.listingId);
      }
    }
    for (const scope of scopes.values()) {
      const deliveries =
        deliveriesByScope.get(`${scope.guildId}:${scope.channelId}`) ?? [];
      try {
        const channel = await client.channels.fetch(scope.channelId);
        if (
          !isNotificationChannel(channel) ||
          channel.guildId !== scope.guildId
        ) {
          logger.warn(
            "监控",
            "跳过无法访问或与服务器不匹配的频道，保留记录等待重试",
            { ...scope },
          );
          continue;
        }
        const endedIds = new Set<string>();
        // Cleanup is independent of current subscriptions and send permissions.
        for (const delivery of deliveries) {
          const expired = delivery.expiresAt <= now();
          const missing =
            listings !== undefined && !listings.has(delivery.listingId);
          if (!expired && !missing) continue;
          endedIds.add(delivery.listingId);
          try {
            // The deadline can also be crossed while channel operations are in flight.
            if (
              expired &&
              (!listings || listings.has(delivery.listingId)) &&
              !expiredListingIds.has(delivery.listingId)
            ) {
              store.markListingExpired(
                delivery.listingId,
                delivery.expiresAt,
                observedAt,
              );
              expiredListingIds.add(delivery.listingId);
            }
            try {
              await channel.messages.delete(delivery.messageId);
            } catch (error) {
              // A message already deleted by Discord or an administrator is also cleaned up.
              if (!isMissingMessage(error)) throw error;
            }
            // GuildMessages intent is disabled, so do not wait for a delete gateway event.
            channel.messages.cache.delete(delivery.messageId);
            store.removeDelivery(scope, delivery.listingId);
            stats.removed++;
            logger.info("监控", "已清理结束招募的消息和投递记录", {
              ...scope,
              listingId: delivery.listingId,
              messageId: delivery.messageId,
              reason: expired ? "已到期" : "网站已移除",
            });
          } catch (error) {
            stats.failed++;
            logger.error("监控", "删除结束招募失败，保留投递记录等待重试", {
              ...scope,
              listingId: delivery.listingId,
              messageId: delivery.messageId,
              error,
            });
          }
        }
        if (!listings || store.getSubscriptions(scope).length === 0) continue;
        const permissionError = await getBotSendError(channel);
        if (permissionError) {
          logger.warn("监控", "频道无法发送消息，跳过本轮投递", {
            ...scope,
            reason: permissionError,
          });
          continue;
        }
        const subscriptions = store.getSubscriptions(scope).flatMap((sub) => {
          try {
            return [{ sub, regex: RE2JS.compile(sub.keyword) }];
          } catch {
            logger.warn("监控", "跳过无效正则订阅", {
              ...scope,
              subscriptionId: sub.id,
            });
            return [];
          }
        });
        for (const listing of listings.values()) {
          if (endedIds.has(listing.id) || expiredListingIds.has(listing.id))
            continue;
          const activeIds = new Set(
            store.getSubscriptions(scope).map((sub) => sub.id),
          );
          const patterns = subscriptions
            .filter(
              ({ sub, regex }) =>
                activeIds.has(sub.id) &&
                (sub.dataCentres.length === 0 ||
                  sub.dataCentres.includes(listing.dataCentre)) &&
                (sub.categories.length === 0 ||
                  sub.categories.includes(listing.category)) &&
                regex.test(listing.rawText),
            )
            .map(({ sub }) => sub.keyword)
            .sort();
          if (patterns.length === 0) continue;
          try {
            const { payload, payloadHash } = buildNotification(
              listing,
              [...new Set(patterns)],
              observedAt,
            );
            const previous = store.getDelivery(scope, listing.id);
            const expiresAt =
              listingExpiries.get(listing.id) ??
              previous?.expiresAt ??
              observedAt + LISTING_LIFETIME_MS;
            if (expiresAt <= now()) continue;
            if (previous?.payloadHash === payloadHash) continue;
            if (previous) {
              try {
                await channel.messages.edit(previous.messageId, payload);
                store.saveDelivery(scope, listing.id, {
                  messageId: previous.messageId,
                  payloadHash,
                  updatedAt: observedAt,
                  expiresAt,
                });
                stats.edited++;
                logger.info("监控", "已更新招募消息", {
                  ...scope,
                  listingId: listing.id,
                  messageId: previous.messageId,
                });
                continue;
              } catch (error) {
                // Only a deleted message permits replacement; permission/network errors retry later.
                if (!isMissingMessage(error)) throw error;
              }
            }
            // Discord's short-lived nonce deduplication also covers an immediate retry
            // when a send was accepted but its response was lost.
            const nonce = createHash("sha256")
              .update(
                `${scope.guildId}:${scope.channelId}:${listing.id}:${previous?.messageId ?? "new"}`,
              )
              .digest("hex")
              .slice(0, 24);
            const message = await channel.send({
              ...payload,
              nonce,
              enforceNonce: true,
            });
            // Synchronous commit immediately after a successful send/edit.
            store.saveDelivery(scope, listing.id, {
              messageId: message.id,
              payloadHash,
              updatedAt: observedAt,
              expiresAt,
            });
            stats.sent++;
            logger.info("监控", "已发送招募消息", {
              ...scope,
              listingId: listing.id,
              messageId: message.id,
            });
          } catch (error) {
            stats.failed++;
            logger.error("监控", "招募投递失败，下次检查重试", {
              ...scope,
              listingId: listing.id,
              error,
            });
          }
        }
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 10003
        ) {
          // Discord confirms the channel no longer exists, so its messages cannot exist either.
          for (const delivery of deliveries) {
            store.removeDelivery(scope, delivery.listingId);
            stats.removed++;
          }
          logger.info("监控", "频道已删除，已清理其投递记录", {
            ...scope,
            removed: deliveries.length,
          });
        } else {
          stats.failed++;
          logger.error("监控", "频道处理失败，保留订阅和投递记录等待重试", {
            ...scope,
            error,
          });
        }
      }
    }
    logger.info("监控", "本轮检查完成", {
      channels: scopes.size,
      listings: listings?.size ?? null,
      expiredListings: expiredListingIds.size,
      ...stats,
      durationMs: now() - startedAt,
    });
  };

  return {
    check(): Promise<void> {
      return (inFlight ??= notify()
        .catch((error) => {
          logger.error("监控", "监控任务异常，下次检查重试", { error });
        })
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
  const monitor = createMonitor(client, getStore());
  const cronExpr = process.env.FETCH_CRON || "*/5 * * * *";
  const job = Bun.cron(cronExpr, () => monitor.check());
  const initialCheck = setTimeout(() => void monitor.check(), 5000);
  logger.info("监控", "招募监控已启动", {
    cron: cronExpr,
    initialDelayMs: 5000,
  });
  return async () => {
    job.stop();
    clearTimeout(initialCheck);
    await monitor.idle();
    logger.info("监控", "招募监控已停止");
  };
}
