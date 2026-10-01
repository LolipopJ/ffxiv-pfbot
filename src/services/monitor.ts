import { createHash } from "crypto";
import type { Client } from "discord.js";
import { RE2JS } from "re2js";

import type { Recruitment } from "../types/recruitment";
import { getBotSendError, isNotificationChannel } from "../utils/channel";
import { buildListingEmbed, field } from "../utils/embed";
import { displayPattern } from "../utils/text";
import { getListings } from "./fetcher";
import { type ChannelScope, getStore, SubscriptionStore } from "./store";

function isMissingMessage(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 10008
  );
}

export function buildNotification(listing: Recruitment, patterns: string[]) {
  const embed = buildListingEmbed(listing).setFooter({
    text: field(
      `${listing.dataCentre} | ${patterns.map((pattern) => displayPattern(pattern)).join("、")}`,
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
) {
  let inFlight: Promise<void> | undefined;

  const notify = async () => {
    const scopes = new Map<string, ChannelScope>();
    for (const sub of store.getMonitorSubscriptions()) {
      scopes.set(`${sub.guildId}:${sub.channelId}`, {
        guildId: sub.guildId,
        channelId: sub.channelId,
      });
    }
    if (scopes.size === 0) return;
    // One page can contain multiple copies of the same recruitment.
    const listings = new Map(
      (await fetchListings()).map((listing) => [listing.id, listing]),
    );
    for (const scope of scopes.values()) {
      try {
        const channel = await client.channels.fetch(scope.channelId);
        if (
          !isNotificationChannel(channel) ||
          channel.guildId !== scope.guildId
        )
          continue;
        const permissionError = await getBotSendError(channel);
        if (permissionError) {
          console.warn(`⚠️ 频道 ${scope.channelId}: ${permissionError}`);
          continue;
        }
        const subscriptions = store.getSubscriptions(scope).flatMap((sub) => {
          try {
            return [{ sub, regex: RE2JS.compile(sub.keyword) }];
          } catch {
            console.warn(`⚠️ 跳过无效正则订阅 ${sub.id}`);
            return [];
          }
        });
        for (const listing of listings.values()) {
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
            const { payload, payloadHash } = buildNotification(listing, [
              ...new Set(patterns),
            ]);
            const previous = store.getDelivery(scope, listing.id);
            if (previous?.payloadHash === payloadHash) continue;
            if (previous) {
              try {
                await channel.messages.edit(previous.messageId, payload);
                store.saveDelivery(scope, listing.id, {
                  messageId: previous.messageId,
                  payloadHash,
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
            });
          } catch (error) {
            console.error(
              `❌ 招募 ${listing.id} 投递到频道 ${scope.channelId} 失败，下次检查重试:`,
              error,
            );
          }
        }
      } catch (error) {
        console.error(
          `❌ 无法处理频道 ${scope.channelId}，保留订阅等待重试:`,
          error,
        );
      }
    }
  };

  return {
    check(): Promise<void> {
      return (inFlight ??= notify()
        .catch((error) => {
          console.error("❌ 监控任务出错:", error);
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
  console.log(`📡 监控已启动，Cron 规则: ${cronExpr}`);
  return async () => {
    job.stop();
    clearTimeout(initialCheck);
    await monitor.idle();
  };
}
