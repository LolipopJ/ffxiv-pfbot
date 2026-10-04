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

import { locale } from "./locales";
import { LANGUAGES, resolveLanguage } from "./locales/utils/config";
import { getCleanup } from "./services/cleanup";
import { startMonitor } from "./services/monitor";
import { closeStore } from "./services/store";
import { getTaskRunner } from "./services/tasks";
import type { Command } from "./types/command";
import { logger } from "./utils/logger";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
resolveLanguage(process.env.LANGUAGE, () =>
  logger.warn("language", "unsupportedLanguage", {
    value: process.env.LANGUAGE,
    fallback: "EN",
    supported: LANGUAGES,
  }),
);
logger.info("startup", "languageConfigured", { language: locale.language });
if (!DISCORD_BOT_TOKEN) {
  logger.error("startup", "missingToken");
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
      logger.info("commands", "commandLoaded", { command: command.data.name });
    } else {
      logger.error("commands", "commandInvalid", {
        filePath,
      });
    }
  } catch (e) {
    logger.error("commands", "commandLoadFailed", { filePath, error: e });
  }
}

// ─── 2. 命令交互处理 ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn("commands", "commandNotFound", {
      command: interaction.commandName,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (e) {
    logger.error("commands", "commandFailed", {
      command: interaction.commandName,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      error: e,
    });
    const reply = {
      content: locale.messages.errors.commandFailed,
      flags: MessageFlags.Ephemeral as const,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (error) {
      logger.error("commands", "commandErrorReplyFailed", {
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
    logger.info("commands", "commandsRegistered", {
      guildId: guild.id,
      guildName: guild.name,
      commands: commands.length,
    });
  } catch (e) {
    logger.error("commands", "commandsRegisterFailed", {
      guildId: guild.id,
      guildName: guild.name,
      error: e,
    });
  }
};

client.on(Events.GuildCreate, async (guild) => {
  logger.info("connection", "guildJoined", {
    guildId: guild.id,
    guildName: guild.name,
  });
  await registerCommands(guild);
});

// ─── 4. 启动 ────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  getTaskRunner(c);
  logger.info("startup", "botReady", {
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
    logger.error("startup", "initializationFailed", { error });
    await client.destroy();
    closeStore();
    process.exit(1);
  }
});

client.on(Events.Error, (error) =>
  logger.error("connection", "clientError", { error }),
);
client.on(Events.Warn, (message) =>
  logger.warn("connection", "clientWarning", { reason: message }),
);

logger.info("startup", "connecting");
client.login(DISCORD_BOT_TOKEN).catch((e) => {
  logger.error("startup", "loginFailed", { error: e });
  process.exit(1);
});

// ─── 5. 关闭 ────────────────────────────────────────────────────────
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("shutdown", "shuttingDown");
  await Promise.all([
    stopMonitor?.(),
    getCleanup(client).stop(),
    getTaskRunner(client).stop(),
  ]);
  await client.destroy();
  closeStore();
  logger.info("shutdown", "shutdownComplete");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
