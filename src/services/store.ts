import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { RE2JS } from "re2js";

export interface ChannelScope {
  guildId: string;
  channelId: string;
}

export interface Subscription extends ChannelScope {
  id: string;
  keyword: string;
  userId: string;
  createdAt: string;
}

export interface Delivery {
  messageId: string;
  payloadHash: string;
}

const SUBSCRIPTION_COLUMNS = `id, guild_id AS guildId, channel_id AS channelId,
  keyword, user_id AS userId, created_at AS createdAt`;

function validateScope(scope: ChannelScope) {
  if (!scope.guildId || !scope.channelId)
    throw new Error("服务器和频道作用域不能为空");
}

export class SubscriptionStore {
  private readonly db: Database;

  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename, { create: true, strict: true });
    this.db.run(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (guild_id, channel_id, keyword)
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id, listing_id)
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  addSubscription(scope: ChannelScope, keyword: string, userId: string) {
    validateScope(scope);
    if (keyword.length === 0 || keyword.length > 1000) {
      return { ok: false as const, reason: "正则表达式长度必须为 1–1000 字符" };
    }
    try {
      RE2JS.compile(keyword);
    } catch {
      return { ok: false as const, reason: "无效的 RE2 正则表达式" };
    }
    const sub: Subscription = {
      ...scope,
      id: randomUUID(),
      keyword,
      userId,
      createdAt: new Date().toISOString(),
    };
    const result = this.db
      .query(
        `
      INSERT INTO subscriptions (id, guild_id, channel_id, keyword, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, channel_id, keyword) DO NOTHING
    `,
      )
      .run(
        sub.id,
        scope.guildId,
        scope.channelId,
        keyword,
        userId,
        sub.createdAt,
      );
    return result.changes
      ? { ok: true as const, sub }
      : { ok: false as const, reason: "该频道已有相同的正则订阅" };
  }

  getSubscriptions(scope: ChannelScope): Subscription[] {
    validateScope(scope);
    return this.db
      .query<Subscription, [string, string]>(
        `
      SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
      WHERE guild_id = ? AND channel_id = ? ORDER BY created_at, id
    `,
      )
      .all(scope.guildId, scope.channelId);
  }

  getSubscriptionsPage(scope: ChannelScope, page = 0, pageSize = 5) {
    validateScope(scope);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 25
    ) {
      throw new Error("无效的分页参数");
    }
    return this.db.transaction(() => {
      const total = this.db
        .query<{ count: number }, [string, string]>(
          `
        SELECT COUNT(*) AS count FROM subscriptions WHERE guild_id = ? AND channel_id = ?
      `,
        )
        .get(scope.guildId, scope.channelId)!.count;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.max(0, Math.min(page, pageCount - 1));
      const subscriptions = this.db
        .query<Subscription, [string, string, number, number]>(
          `
        SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
        WHERE guild_id = ? AND channel_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?
      `,
        )
        .all(scope.guildId, scope.channelId, pageSize, currentPage * pageSize);
      return { subscriptions, total, pageCount, page: currentPage };
    })();
  }

  removeSubscription(scope: ChannelScope, id: string) {
    validateScope(scope);
    return (
      this.db
        .query(
          `
      DELETE FROM subscriptions WHERE id = ? AND guild_id = ? AND channel_id = ?
    `,
        )
        .run(id, scope.guildId, scope.channelId).changes > 0
    );
  }

  // Only the trusted background monitor may enumerate all channel scopes.
  getMonitorSubscriptions(): Subscription[] {
    return this.db
      .query<Subscription, []>(
        `
      SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions ORDER BY guild_id, channel_id, id
    `,
      )
      .all();
  }

  getDelivery(scope: ChannelScope, listingId: string): Delivery | null {
    validateScope(scope);
    return this.db
      .query<Delivery, [string, string, string]>(
        `
      SELECT message_id AS messageId, payload_hash AS payloadHash FROM deliveries
      WHERE guild_id = ? AND channel_id = ? AND listing_id = ?
    `,
      )
      .get(scope.guildId, scope.channelId, listingId);
  }

  saveDelivery(scope: ChannelScope, listingId: string, delivery: Delivery) {
    validateScope(scope);
    this.db
      .query(
        `
      INSERT INTO deliveries (guild_id, channel_id, listing_id, message_id, payload_hash)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, channel_id, listing_id) DO UPDATE SET
        message_id = excluded.message_id, payload_hash = excluded.payload_hash
    `,
      )
      .run(
        scope.guildId,
        scope.channelId,
        listingId,
        delivery.messageId,
        delivery.payloadHash,
      );
  }

  close() {
    this.db.close();
  }
}

let store: SubscriptionStore | undefined;

export function getStore() {
  return (store ??= new SubscriptionStore(
    process.env.DATABASE_PATH ||
      join(import.meta.dir, "../../data/pfbot.sqlite"),
  ));
}

export function closeStore() {
  store?.close();
  store = undefined;
}
