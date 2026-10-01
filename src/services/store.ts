import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { RE2JS } from "re2js";

import { CATEGORY_LABEL, DATA_CENTRE_LABEL } from "../locales/zh-cn";
import type { Category } from "../types/recruitment";
import { logger } from "../utils/logger";

export interface ChannelScope {
  guildId: string;
  channelId: string;
}

export interface SubscriptionFilters {
  dataCentres?: string[];
  categories?: Category[];
}

export interface Subscription extends ChannelScope {
  id: string;
  keyword: string;
  userId: string;
  createdAt: string;
  dataCentres: string[];
  categories: Category[];
}

interface SubscriptionRow extends Omit<
  Subscription,
  "dataCentres" | "categories"
> {
  dataCentres: string;
  categories: string;
}

export interface Delivery {
  messageId: string;
  payloadHash: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface MonitorDelivery extends ChannelScope, Delivery {
  listingId: string;
}

export interface ExpiredListing {
  listingId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

const SUBSCRIPTION_COLUMNS = `id, guild_id AS guildId, channel_id AS channelId,
  keyword, user_id AS userId, created_at AS createdAt,
  data_centres AS dataCentres, categories`;

function readSubscription(row: SubscriptionRow): Subscription {
  return {
    ...row,
    dataCentres: JSON.parse(row.dataCentres),
    categories: JSON.parse(row.categories),
  };
}

export function getKeywordError(keyword: string) {
  if (keyword.length === 0 || keyword.length > 1000)
    return "正则表达式长度必须为 1–1000 字符";
  try {
    RE2JS.compile(keyword);
    return null;
  } catch {
    return "无效的 RE2 正则表达式";
  }
}

function validateSubscription(keyword: string, filters: SubscriptionFilters) {
  const keywordError = getKeywordError(keyword);
  if (keywordError) return { ok: false as const, reason: keywordError };
  const dataCentres = [...new Set(filters.dataCentres ?? [])].sort();
  const categories = [...new Set(filters.categories ?? [])].sort();
  if (dataCentres.some((value) => !Object.hasOwn(DATA_CENTRE_LABEL, value)))
    return { ok: false as const, reason: "无效的数据中心" };
  if (categories.some((value) => !Object.hasOwn(CATEGORY_LABEL, value)))
    return { ok: false as const, reason: "无效的招募类别" };
  return { ok: true as const, dataCentres, categories };
}

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
        data_centres TEXT NOT NULL DEFAULT '[]',
        categories TEXT NOT NULL DEFAULT '[]',
        UNIQUE (guild_id, channel_id, keyword, data_centres, categories)
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, channel_id, listing_id)
      );
      CREATE INDEX IF NOT EXISTS deliveries_listing_id ON deliveries (listing_id);
      CREATE TABLE IF NOT EXISTS expired_listings (
        listing_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  addSubscription(
    scope: ChannelScope,
    keyword: string,
    userId: string,
    filters: SubscriptionFilters = {},
  ) {
    validateScope(scope);
    const validated = validateSubscription(keyword, filters);
    if (!validated.ok) return validated;
    const { dataCentres, categories } = validated;
    const sub: Subscription = {
      ...scope,
      id: randomUUID(),
      keyword,
      userId,
      createdAt: new Date().toISOString(),
      dataCentres,
      categories,
    };
    const result = this.db
      .query(
        `
      INSERT INTO subscriptions
        (id, guild_id, channel_id, keyword, user_id, created_at, data_centres, categories)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, channel_id, keyword, data_centres, categories) DO NOTHING
    `,
      )
      .run(
        sub.id,
        scope.guildId,
        scope.channelId,
        keyword,
        userId,
        sub.createdAt,
        JSON.stringify(dataCentres),
        JSON.stringify(categories),
      );
    return result.changes
      ? { ok: true as const, sub }
      : {
          ok: false as const,
          reason: "该频道已有相同正则和筛选条件的招募订阅",
        };
  }

  getSubscription(scope: ChannelScope, id: string): Subscription | null {
    validateScope(scope);
    const row = this.db
      .query<SubscriptionRow, [string, string, string]>(
        `
      SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
      WHERE id = ? AND guild_id = ? AND channel_id = ?
    `,
      )
      .get(id, scope.guildId, scope.channelId);
    return row ? readSubscription(row) : null;
  }

  updateSubscription(
    scope: ChannelScope,
    id: string,
    keyword: string,
    filters: SubscriptionFilters = {},
  ) {
    validateScope(scope);
    return this.db
      .transaction(() => {
        const current = this.getSubscription(scope, id);
        if (!current)
          return {
            ok: false as const,
            reason: "未找到该招募订阅或无权操作。",
          };
        const validated = validateSubscription(keyword, {
          dataCentres: filters.dataCentres ?? current.dataCentres,
          categories: filters.categories ?? current.categories,
        });
        if (!validated.ok) return validated;
        const { dataCentres, categories } = validated;
        const result = this.db
          .query(
            `
        UPDATE OR IGNORE subscriptions SET keyword = ?, data_centres = ?, categories = ?
        WHERE id = ? AND guild_id = ? AND channel_id = ?
      `,
          )
          .run(
            keyword,
            JSON.stringify(dataCentres),
            JSON.stringify(categories),
            id,
            scope.guildId,
            scope.channelId,
          );
        return result.changes
          ? {
              ok: true as const,
              sub: { ...current, keyword, dataCentres, categories },
            }
          : {
              ok: false as const,
              reason: "该频道已有相同正则和筛选条件的招募订阅",
            };
      })
      .immediate();
  }

  getSubscriptions(scope: ChannelScope): Subscription[] {
    validateScope(scope);
    return this.db
      .query<SubscriptionRow, [string, string]>(
        `
      SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
      WHERE guild_id = ? AND channel_id = ? ORDER BY created_at, id
    `,
      )
      .all(scope.guildId, scope.channelId)
      .map(readSubscription);
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
        .query<SubscriptionRow, [string, string, number, number]>(
          `
        SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
        WHERE guild_id = ? AND channel_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?
      `,
        )
        .all(scope.guildId, scope.channelId, pageSize, currentPage * pageSize)
        .map(readSubscription);
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
      .query<SubscriptionRow, []>(
        `
      SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions ORDER BY guild_id, channel_id, id
    `,
      )
      .all()
      .map(readSubscription);
  }

  getDelivery(scope: ChannelScope, listingId: string): Delivery | null {
    validateScope(scope);
    return this.db
      .query<Delivery, [string, string, string]>(
        `
      SELECT message_id AS messageId, payload_hash AS payloadHash,
        created_at AS createdAt, updated_at AS updatedAt,
        expires_at AS expiresAt FROM deliveries
      WHERE guild_id = ? AND channel_id = ? AND listing_id = ?
    `,
      )
      .get(scope.guildId, scope.channelId, listingId);
  }

  // Only the trusted background monitor may enumerate delivery records across channels.
  getMonitorDeliveries(): MonitorDelivery[] {
    return this.db
      .query<MonitorDelivery, []>(
        `
        SELECT guild_id AS guildId, channel_id AS channelId, listing_id AS listingId,
          message_id AS messageId, payload_hash AS payloadHash,
          created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt
        FROM deliveries ORDER BY guild_id, channel_id, listing_id
      `,
      )
      .all();
  }

  getExpiredListings(): ExpiredListing[] {
    return this.db
      .query<ExpiredListing, []>(
        `SELECT listing_id AS listingId, created_at AS createdAt,
          updated_at AS updatedAt, expires_at AS expiresAt
        FROM expired_listings ORDER BY listing_id`,
      )
      .all();
  }

  getExpiredListingIds(): string[] {
    return this.getExpiredListings().map((listing) => listing.listingId);
  }

  markListingExpired(listingId: string, expiresAt: number, updatedAt: number) {
    this.db
      .query(
        `
        INSERT INTO expired_listings (listing_id, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (listing_id) DO UPDATE SET
          updated_at = excluded.updated_at, expires_at = excluded.expires_at
      `,
      )
      .run(listingId, updatedAt, updatedAt, expiresAt);
  }

  removeExpiredListing(listingId: string) {
    this.db
      .query("DELETE FROM expired_listings WHERE listing_id = ?")
      .run(listingId);
  }

  removeDelivery(scope: ChannelScope, listingId: string) {
    validateScope(scope);
    return (
      this.db
        .query(
          `DELETE FROM deliveries WHERE guild_id = ? AND channel_id = ? AND listing_id = ?`,
        )
        .run(scope.guildId, scope.channelId, listingId).changes > 0
    );
  }

  // Website observations update every channel, independently of Discord operations.
  refreshMonitorDeliveries(
    listingExpiries: ReadonlyMap<string, number | null>,
    updatedAt: number,
  ) {
    const update = this.db.query(
      `UPDATE deliveries SET updated_at = ?, expires_at = COALESCE(?, expires_at)
        WHERE listing_id = ?`,
    );
    this.db.transaction(() => {
      for (const [listingId, expiresAt] of listingExpiries)
        update.run(updatedAt, expiresAt, listingId);
    })();
  }

  saveDelivery(
    scope: ChannelScope,
    listingId: string,
    delivery: Omit<Delivery, "createdAt">,
  ) {
    validateScope(scope);
    this.db
      .query(
        `
      INSERT INTO deliveries
        (guild_id, channel_id, listing_id, message_id, payload_hash, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, channel_id, listing_id) DO UPDATE SET
        message_id = excluded.message_id, payload_hash = excluded.payload_hash,
        updated_at = excluded.updated_at, expires_at = excluded.expires_at
    `,
      )
      .run(
        scope.guildId,
        scope.channelId,
        listingId,
        delivery.messageId,
        delivery.payloadHash,
        delivery.updatedAt,
        delivery.updatedAt,
        delivery.expiresAt,
      );
  }

  close() {
    this.db.close();
  }
}

let store: SubscriptionStore | undefined;

export function getStore() {
  if (!store) {
    const filename =
      process.env.DATABASE_PATH ||
      join(import.meta.dir, "../../data/pfbot.sqlite");
    store = new SubscriptionStore(filename);
    logger.info("数据库", "订阅数据库已打开", { filename });
  }
  return store;
}

export function closeStore() {
  if (!store) return;
  store?.close();
  store = undefined;
  logger.info("数据库", "订阅数据库已关闭");
}
