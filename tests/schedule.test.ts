import {
  afterEach,
  beforeEach,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { PresenceData } from "discord.js";

import { LOCALES } from "../src/locales";
import { startMonitor } from "../src/services/monitor";
import { closeStore, getStore } from "../src/services/store";
import { getTaskRunner } from "../src/services/tasks";
import { fakeClient, scopeA } from "./helpers";

const originalCron = Bun.cron;
const originalFetch = globalThis.fetch;
const originalSetImmediate = setImmediate;
const originalEnv = {
  DATABASE_PATH: process.env.DATABASE_PATH,
  FETCH_CRON: process.env.FETCH_CRON,
};
const jobs: Bun.CronJob[] = [];
const checks: (() => void)[] = [];
const time = Date.parse("2026-10-20T12:02:30Z");
let stop: (() => Promise<void>) | undefined;
let html = '<div id="listings"></div>';
let fetchError = false;

beforeEach(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.FETCH_CRON = "*/7 * * * *";
  jest.useFakeTimers();
  spyOn(Date, "now").mockReturnValue(time);
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        if (fetchError) throw new Error("offline");
        return new Response(html, { headers: { "content-type": "text/html" } });
      },
      { preconnect: originalFetch.preconnect },
    ),
  );
  const cron = spyOn(Bun, "cron").mockImplementation(((
    pattern: string,
    callback: (this: Bun.CronJob) => unknown,
  ) => {
    const job = originalCron(pattern, callback);
    checks.push(() => void callback.call(job));
    jobs.push(job);
    return job;
  }) as typeof Bun.cron);
  Object.assign(cron, { parse: originalCron.parse });
  getStore().addSubscription(scopeA, "never matches", "user");
});

afterEach(async () => {
  await stop?.();
  stop = undefined;
  for (const job of jobs.splice(0)) job.stop();
  checks.length = 0;
  closeStore();
  mock.restore();
  jest.useRealTimers();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  html = '<div id="listings"></div>';
  fetchError = false;
});

const flush = () =>
  new Promise<void>((resolve) => originalSetImmediate(resolve));

async function tick(delay = 5000) {
  jest.advanceTimersByTime(delay);
  await flush();
}

function start() {
  const client = fakeClient([]);
  const presences: PresenceData[] = [];
  Object.assign(client, {
    user: { setPresence: (presence: PresenceData) => presences.push(presence) },
  });
  getTaskRunner(client, LOCALES.EN);
  stop = startMonitor(client);
  return presences;
}

test("startup waits for the first check before publishing presence", async () => {
  const presences = start();
  expect(presences).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();

  await tick(4999);
  expect(presences).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();

  await tick(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(presences[0]?.activities?.[0]?.name).toBe(
    LOCALES.EN.messages.presence.fetching,
  );
});

test("empty source listings retry one hour later until nonempty listings restore the custom cron", async () => {
  const presences = start();
  const stopCron = spyOn(jobs[0]!, "stop");
  await tick();
  expect(stopCron).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(1);
  expect(presences.at(-1)?.activities?.[0]?.name).toContain(
    new Date(time + 3_600_000).toLocaleString(LOCALES.EN.intlLocale, {
      hour12: false,
    }),
  );

  await tick(3_599_999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(1);
  expect(jobs).toHaveLength(1);

  // No subscription matches this recruitment; scheduling uses the source count.
  html = '<div id="listings"><div class="listing" data-id="123"></div></div>';
  await tick(3_600_000);
  expect(jest.getTimerCount()).toBe(1);
  expect(jobs).toHaveLength(2);
  expect(jobs[1]!.cron).toBe("*/7 * * * *");
  expect(presences.at(-1)?.activities?.[0]?.name).toContain(
    originalCron
      .parse("*/7 * * * *", time)!
      .toLocaleString(LOCALES.EN.intlLocale, { hour12: false }),
  );
  await stop!();
  expect(jest.getTimerCount()).toBe(0);
});

test("failed fetches preserve the current cron or maintenance retry schedule", async () => {
  start();
  fetchError = true;
  await tick();
  expect(jobs[0]!.cron).toBe("*/7 * * * *");
  expect(jest.getTimerCount()).toBe(1);

  await stop!();
  start();
  fetchError = false;
  await tick();
  fetchError = true;
  await tick(3_600_000);
  expect(jest.getTimerCount()).toBe(1);
  expect(jobs).toHaveLength(2);

  html = "invalid page";
  fetchError = false;
  await tick(3_600_000);
  expect(jest.getTimerCount()).toBe(1);
  await stop!();
  expect(jest.getTimerCount()).toBe(0);
});

test("maintenance detected by cron cancels the pending startup check", async () => {
  start();
  checks[0]!();
  await flush();
  expect(jest.getTimerCount()).toBe(1);
  await tick(5000);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("shutdown during a fetch does not schedule a maintenance retry", async () => {
  const response = Promise.withResolvers<Response>();
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => response.promise, {
      preconnect: originalFetch.preconnect,
    }),
  );
  start();
  await tick();
  const stopping = stop!();
  response.resolve(
    new Response(html, { headers: { "content-type": "text/html" } }),
  );
  await stopping;
  await flush();
  expect(jest.getTimerCount()).toBe(0);
  expect(jobs).toHaveLength(1);
});

test("updating the next execution time preserves the status of a running task", async () => {
  const client = fakeClient([]);
  const presences: PresenceData[] = [];
  Object.assign(client, {
    user: { setPresence: (presence: PresenceData) => presences.push(presence) },
  });
  const runner = getTaskRunner(client, LOCALES.EN);
  const pending = Promise.withResolvers<void>();
  const task = runner.run("clearing", () => pending.promise);
  await flush();
  runner.setNextRunAt(new Date(time + 3_600_000));
  const runningStatus = presences.at(-1)?.activities?.[0]?.name;
  pending.resolve();
  await task;
  expect(runningStatus).toBe(LOCALES.EN.messages.presence.clearing);
  expect(presences.at(-1)?.activities?.[0]?.name).toContain(
    new Date(time + 3_600_000).toLocaleString(LOCALES.EN.intlLocale, {
      hour12: false,
    }),
  );
});

test("maintenance deadline is visible within Discord's first five presence updates", async () => {
  const client = fakeClient([]);
  const visible: PresenceData[] = [];
  let updates = 0;
  Object.assign(client, {
    user: {
      setPresence: (presence: PresenceData) => {
        if (++updates <= 5) visible.push(presence);
      },
    },
  });
  getTaskRunner(client, LOCALES.EN);
  stop = startMonitor(client);
  await tick();
  expect(updates).toBeLessThanOrEqual(5);
  expect(
    visible.slice(1).map((presence) => presence.activities?.[0]?.name),
  ).not.toContain(visible[0]?.activities?.[0]?.name);
  expect(visible.at(-1)?.activities?.[0]?.name).toContain(
    new Date(time + 3_600_000).toLocaleString(LOCALES.EN.intlLocale, {
      hour12: false,
    }),
  );
});
