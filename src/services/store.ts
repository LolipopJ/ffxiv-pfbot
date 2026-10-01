import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { RE2JS } from "re2js";

import { CategoryLabel, DataCentre } from "../constants";
import type { Category } from "../types/recruitment";

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
        PRIMARY KEY (guild_id, channel_id, listing_id)
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
    const keywordError = getKeywordError(keyword);
    if (keywordError) return { ok: false as const, reason: keywordError };
    const dataCentres = [...new Set(filters.dataCentres ?? [])].sort();
    const categories = [...new Set(filters.categories ?? [])].sort();
    if (dataCentres.some((value) => !Object.hasOwn(DataCentre, value)))
      return { ok: false as const, reason: "无效的数据中心" };
    if (categories.some((value) => !Object.hasOwn(CategoryLabel, value)))
      return { ok: false as const, reason: "无效的招募类别" };
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
      : { ok: false as const, reason: "该频道已有相同正则和筛选条件的订阅" };
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
