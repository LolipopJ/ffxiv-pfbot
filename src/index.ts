import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Guild,
  MessageFlags,
} from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";

import { getCleanup } from "./services/cleanup";
import { startMonitor } from "./services/monitor";
import { closeStore } from "./services/store";
import { getTaskRunner } from "./services/tasks";
import type { Command } from "./types/command";
import { logger } from "./utils/logger";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  logger.error("启动", "缺少 DISCORD_BOT_TOKEN，请检查环境变量或 .env 文件");
  process.exit(1);
}

class MyClient extends Client {
  commands = new Collection<string, Command>();
}

const client = new MyClient({
  intents: [GatewayIntentBits.Guilds],
});

let stopMonitor: (() => Promise<void>) | undefined;
let isShuttingDown = false;

// ─── 1. 动态导入所有命令 ──────────────────────────────────────────────────
// 自动匹配 src/commands/ 下所有 .ts 文件，无需手动维护列表
const commandsFolder = join(import.meta.dir, "commands");
const commandFiles = readdirSync(commandsFolder).filter((file) =>
  file.endsWith(".ts"),
);
for (const commandFile of commandFiles) {
  const filePath = join(commandsFolder, commandFile);
  try {
    const command = await import(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
      logger.info("命令", "命令已加载", { command: command.data.name });
    } else {
      logger.error("命令", "命令加载失败，缺少 data 或 execute 属性", {
        filePath,
      });
    }
  } catch (e) {
    logger.error("命令", "命令加载失败", { filePath, error: e });
  }
}

// ─── 2. 命令交互处理 ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn("命令", "未找到请求的命令", {
      command: interaction.commandName,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (e) {
    logger.error("命令", "命令执行失败", {
      command: interaction.commandName,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      error: e,
    });
    const reply = {
      content: "❌ 命令执行出错",
      flags: MessageFlags.Ephemeral as const,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (error) {
      logger.error("命令", "发送命令错误提示失败", {
        command: interaction.commandName,
        error,
      });
    }
  }
});

// ─── 3. Bot 加入新服务器时自动注册命令 ─────────────────────────────────────────
const registerCommands = async (guild: Guild) => {
  const commands = Array.from(client.commands.values()).map((cmd) => cmd.data);
  try {
    await guild.commands.set(commands);
    logger.info("命令", "服务器命令注册完成", {
      guildId: guild.id,
      guildName: guild.name,
      commands: commands.length,
    });
  } catch (e) {
    logger.error("命令", "服务器命令注册失败", {
      guildId: guild.id,
      guildName: guild.name,
      error: e,
    });
  }
};

client.on(Events.GuildCreate, async (guild) => {
  logger.info("连接", "机器人已加入服务器", {
    guildId: guild.id,
    guildName: guild.name,
  });
  await registerCommands(guild);
});

// ─── 4. 启动 ────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  getTaskRunner(c);
  logger.info("启动", "机器人已上线", {
    user: c.user.tag,
    commands: client.commands.size,
    guilds: c.guilds.cache.size,
  });

  // 为所有已有服务器注册命令
  for (const guild of c.guilds.cache.values()) {
    await registerCommands(guild);
  }

  if (isShuttingDown) return;
  try {
    if (!isShuttingDown) {
      stopMonitor = startMonitor(c);
      getCleanup(c).start();
    }
  } catch (error) {
    logger.error("启动", "初始化数据库或启动监控失败", { error });
    await client.destroy();
    closeStore();
    process.exit(1);
  }
});

client.on(Events.Error, (error) =>
  logger.error("连接", "Discord 客户端错误", { error }),
);
client.on(Events.Warn, (message) =>
  logger.warn("连接", "Discord 客户端警告", { reason: message }),
);

logger.info("启动", "正在连接 Discord");
client.login(DISCORD_BOT_TOKEN).catch((e) => {
  logger.error("启动", "Discord 登录失败", { error: e });
  process.exit(1);
});

// ─── 5. 关闭 ────────────────────────────────────────────────────────
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("关闭", "正在关闭机器人，等待监控和清理任务完成");
  await Promise.all([
    stopMonitor?.(),
    getCleanup(client).stop(),
    getTaskRunner(client).stop(),
  ]);
  await client.destroy();
  closeStore();
  logger.info("关闭", "机器人已关闭");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
