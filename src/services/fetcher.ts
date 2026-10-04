import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { locale } from "../locales";
import type {
  Category,
  Job,
  Recruitment,
  Slot,
  SlotRole,
} from "../types/recruitment";
import { logger } from "../utils/logger";

const XIVPF_URL = process.env.XIVPF_URL || "https://xivpf.com/listings";
export const MAX_HTML_BYTES = 16 * 1024 * 1024;

export async function getListings({
  fetchPage = fetch,
  timeoutMs = 30_000,
}: {
  fetchPage?: (url: string, options: RequestInit) => Promise<Response>;
  timeoutMs?: number;
} = {}): Promise<Recruitment[]> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const fetchTimeout = setTimeout(() => controller.abort(), timeoutMs);
  let reader:
    | Pick<
        ReadableStreamDefaultReader<Uint8Array>,
        "read" | "cancel" | "releaseLock"
      >
    | undefined;
  try {
    const res = await fetchPage(XIVPF_URL, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok)
      throw new Error(
        locale.messages.logs.errors.fetchHttp({ status: res.status }),
      );
    if (
      !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(
        res.headers.get("content-type") || "",
      )
    ) {
      throw new Error(locale.messages.logs.errors.fetchNotHtml);
    }
    reader = res.body?.getReader();
    if (!reader) throw new Error(locale.messages.logs.errors.fetchEmptyBody);
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) {
        throw new Error(locale.messages.logs.errors.fetchTooLarge);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    const listings = parseListings(chunks.join(""));
    logger.info("fetcher", "listingsFetched", {
      listings: listings.length,
      htmlKiB: Number((bytes / 1024).toFixed(1)),
      durationMs: Date.now() - startedAt,
    });
    return listings;
  } finally {
    clearTimeout(fetchTimeout);
    controller.abort();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

export function parseListings(html: string): Recruitment[] {
  const $ = cheerio.load(html);
  if ($("#listings").length !== 1) {
    throw new Error(locale.messages.logs.errors.missingListingsContainer);
  }
  const listings: Recruitment[] = [];

  // 精准定位每个 .listing 容器
  $("#listings .listing").each((_, el) => {
    const $el = $(el);
    const id = $el.attr("data-id");
    if (!id) throw new Error(locale.messages.logs.errors.missingListingId);

    const duty = $el.find(".duty").first().text().trim();
    const description = $el
      .find(".description")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const minIlvl = $el.find(".middle .stat .value").first().text().trim();
    const creator = $el.find(".item.creator .text").first().text().trim();
    const world = $el.find(".item.world .text").first().text().trim();
    const expires = $el.find(".item.expires .text").first().text().trim();
    const updated = $el.find(".item.updated .text").first().text().trim();
    const slots: Slot[] = [];
    $el.find(".party .slot:not(.total)").each((_, slotEl) => {
      slots.push(parseSlot($(slotEl)));
    });
    const totalString = $el.find(".party .total").first().text().trim();
    const [current = NaN, total = NaN] = totalString
      .split("/")
      .map((s) => parseInt(s.trim(), 10));

    listings.push({
      id,
      duty,
      description,
      category: ($el.attr("data-pf-category") as Category) || "None",
      dataCentre: $el.attr("data-centre") || "Unknown",
      minIlvl,
      slots,
      current,
      total,
      creator,
      world,
      expires,
      updated,
      // 将关键字段拼接为单一字符串供正则匹配
      rawText: [duty, description].join(" "),
    });
  });

  return listings;
}

function parseSlot($el: cheerio.Cheerio<Element>): Slot {
  const classes =
    $el
      .attr("class")
      ?.split(" ")
      .filter((c) => !!c) || [];
  const title = ($el.attr("title") || "").trim();
  const filled = classes.includes("filled");

  const role: SlotRole[] = [];
  const acceptedJobs: Job[] = [];

  if (classes.includes("empty")) {
    role.push("empty");
    acceptedJobs.push("ANY");
  } else {
    if (classes.includes("tank")) role.push("tank");
    if (classes.includes("healer")) role.push("healer");
    if (classes.includes("dps")) role.push("dps");
    if (role.length === 3) {
      // 空位包含三种职能时，简化为 ANY 所有人处理
      acceptedJobs.push("ANY");
    } else {
      acceptedJobs.push(...(title.split(/\s+/).filter(Boolean) as Job[]));
    }
  }

  return { filled, role, acceptedJobs };
}
