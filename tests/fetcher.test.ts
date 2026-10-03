import { afterEach, expect, mock, spyOn, test } from "bun:test";

import {
  getListings,
  MAX_HTML_BYTES,
  parseListings,
} from "../src/services/fetcher";

const html = `<div id="listings" class="list">
  <div class="listing" data-id="123" data-centre="Mana" data-pf-category="HighEndDuty">
    <div class="duty">The Omega Protocol (Ultimate)</div>
    <div class="description"><span>[Practice] </span>P5   delta &amp; sigma</div>
    <div class="party">
      <div class="slot filled tank" title="PLD"></div>
      <div class="slot healer" title="WHM SCH AST SGE"></div>
      <div class="slot empty"></div><div class="total">1/8</div>
    </div>
    <div class="middle"><div class="stat"><div class="value">780</div></div></div>
    <div class="item creator"><span class="text">Test @ Anima</span></div>
    <div class="item world"><span class="text">Anima</span></div>
    <div class="item expires"><span class="text">in an hour</span></div>
    <div class="item updated"><span class="text">23 minutes ago</span></div>
  </div>
</div>`;

afterEach(() => mock.restore());

test("parses the current XIVPF structure into searchable text and party slots", () => {
  expect(parseListings(html)).toEqual([
    {
      id: "123",
      duty: "The Omega Protocol (Ultimate)",
      description: "[Practice] P5 delta & sigma",
      category: "HighEndDuty",
      dataCentre: "Mana",
      minIlvl: "780",
      current: 1,
      total: 8,
      creator: "Test @ Anima",
      world: "Anima",
      expires: "in an hour",
      updated: "23 minutes ago",
      rawText: "The Omega Protocol (Ultimate) [Practice] P5 delta & sigma",
      slots: [
        { filled: true, role: ["tank"], acceptedJobs: ["PLD"] },
        {
          filled: false,
          role: ["healer"],
          acceptedJobs: ["WHM", "SCH", "AST", "SGE"],
        },
        { filled: false, role: ["empty"], acceptedJobs: ["ANY"] },
      ],
    },
  ]);
});

test("an empty listing page is valid, unexpected pages and missing IDs fail visibly", () => {
  expect(parseListings('<div id="listings"></div>')).toEqual([]);
  expect(() => parseListings("<html>Access denied</html>")).toThrow(
    "container",
  );
  expect(() => parseListings(html.replace('data-id="123"', ""))).toThrow("ID");
});

test("fetches HTML successfully without accepting non-HTML or HTTP errors", async () => {
  spyOn(console, "log").mockImplementation(() => {});
  const fetchPage = mock(
    async () =>
      new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  );
  expect(await getListings({ fetchPage })).toHaveLength(1);
  await expect(
    getListings({
      fetchPage: async () => new Response("denied", { status: 403 }),
    }),
  ).rejects.toThrow("403");
  await expect(
    getListings({
      fetchPage: async () =>
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
    }),
  ).rejects.toThrow("HTML page");
});

test("the timeout also aborts a stalled response body and a later fetch can recover", async () => {
  spyOn(console, "log").mockImplementation(() => {});
  const fetchPage = mock(async (_url: string, options: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<div id="listings">'));
        options.signal!.addEventListener(
          "abort",
          () => controller.error(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/html" } });
  });
  await expect(getListings({ fetchPage, timeoutMs: 20 })).rejects.toThrow(
    "Aborted",
  );
  expect(
    await getListings({
      fetchPage: async () =>
        new Response(html, { headers: { "Content-Type": "text/html" } }),
    }),
  ).toHaveLength(1);
});

test("limits streamed bytes even when Content-Length is absent or misleading", async () => {
  let cancelled = false;
  let chunks = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks++;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    getListings({
      fetchPage: async () =>
        new Response(body, {
          headers: { "Content-Type": "text/html", "Content-Length": "1" },
        }),
    }),
  ).rejects.toThrow("16 MiB");
  expect(cancelled).toBe(true);
  expect(chunks).toBeLessThanOrEqual(MAX_HTML_BYTES / (1024 * 1024) + 2);
});
