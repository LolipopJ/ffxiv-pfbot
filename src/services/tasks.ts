import { ActivityType, type Client } from "discord.js";

import { type Locale, locale } from "../locales";
import { logger } from "../utils/logger";
import { truncate } from "../utils/text";

type TaskState = "idle" | "fetching" | "clearing";

export function createTaskRunner(
  client: Client,
  cron = process.env.FETCH_CRON || "*/5 * * * *",
  language: Locale = locale,
) {
  let tail = Promise.resolve();
  let stopped = false;

  const show = (state: TaskState) => {
    try {
      let name = "";
      switch (state) {
        case "fetching":
          name = language.messages.presence.fetching;
          break;
        case "clearing":
          name = language.messages.presence.clearing;
          break;
        case "idle":
        default:
          name = language.messages.presence.next({
            time:
              Bun.cron
                .parse(cron, Date.now())
                ?.toLocaleString(language.intlLocale, { hour12: false }) ??
              language.messages.presence.noNextTime,
          });
      }
      client.user?.setPresence({
        status: "online",
        activities: [
          {
            name: truncate(name, 128),
            type: ActivityType.Playing,
          },
        ],
      });
    } catch (error) {
      logger.warn("presence", "presenceFailed", { error });
    }
  };
  show("idle");

  return {
    cron,
    run<T>(state: TaskState, task: () => Promise<T>): Promise<T> {
      if (stopped)
        return Promise.reject(
          new Error(language.messages.logs.errors.botShuttingDown),
        );
      const result = tail.then(async () => {
        show(state);
        try {
          return await task();
        } finally {
          show("idle");
        }
      });
      // A failed task must not prevent subsequent tasks from running.
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    async stop() {
      stopped = true;
      await tail;
    },
  };
}

const runners = new WeakMap<Client, ReturnType<typeof createTaskRunner>>();

export function getTaskRunner(client: Client, language: Locale = locale) {
  let runner = runners.get(client);
  if (!runner) {
    runner = createTaskRunner(client, undefined, language);
    runners.set(client, runner);
  }
  return runner;
}
