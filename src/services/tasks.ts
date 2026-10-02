import { ActivityType, type Client } from "discord.js";

import { logger } from "../utils/logger";

type TaskState = "idle" | "fetching" | "clearing";

export function createTaskRunner(
  client: Client,
  cron = process.env.FETCH_CRON || "*/5 * * * *",
) {
  let tail = Promise.resolve();
  let stopped = false;

  const show = (state: TaskState) => {
    try {
      let name = "";
      switch (state) {
        case "fetching":
          name = "获取并处理招募信息中...";
          break;
        case "clearing":
          name = "清理过期的招募信息中...";
          break;
        case "idle":
        default:
          name = `下次执行：${Bun.cron.parse(cron, Date.now())?.toLocaleString("zh-CN", { hour12: false }) ?? "无匹配时间"}`;
      }
      client.user?.setPresence({
        status: "online",
        activities: [
          {
            name,
            type: ActivityType.Playing,
          },
        ],
      });
    } catch (error) {
      logger.warn("状态", "更新机器人状态失败", { error });
    }
  };
  show("idle");

  return {
    cron,
    run<T>(state: TaskState, task: () => Promise<T>): Promise<T> {
      if (stopped) return Promise.reject(new Error("机器人正在关闭"));
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

export function getTaskRunner(client: Client) {
  let runner = runners.get(client);
  if (!runner) {
    runner = createTaskRunner(client);
    runners.set(client, runner);
  }
  return runner;
}
