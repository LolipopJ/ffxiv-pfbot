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

import { startMonitor } from "./services/monitor";
import { closeStore } from "./services/store";
import type { Command } from "./types/command";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  throw new Error("❌️ DISCORD_BOT_TOKEN is not defined in .env");
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
      console.log(`📦 已加载命令: /${command.data.name}`);
    } else {
      console.error(`❌ 加载命令 ${filePath} 失败: 缺少 data 或 execute 属性`);
    }
  } catch (e) {
    console.error(`❌ 加载命令 ${filePath} 失败:`, e);
  }
}

// ─── 2. 命令交互处理 ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`❌ 未找到命令: /${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (e) {
    console.error(`❌ /${interaction.commandName} 执行出错:`, e);
    const reply = {
      content: "❌ 命令执行出错",
      flags: MessageFlags.Ephemeral as const,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ─── 3. Bot 加入新服务器时自动注册命令 ─────────────────────────────────────────
const registerCommands = async (guild: Guild) => {
  const commands = Array.from(client.commands.values()).map((cmd) => cmd.data);
  try {
    await guild.commands.set(commands);
    console.log(`✅ 已为 ${guild.name} 注册 ${commands.length} 个命令`);
  } catch (e) {
    console.error(`❌ 注册命令到 ${guild.name} 失败:`, e);
  }
};

client.on(Events.GuildCreate, async (guild) => {
  console.log(`🆕 被邀请到新服务器: ${guild.name} (${guild.id})`);
  await registerCommands(guild);
});

// ─── 4. 启动 ────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot 已上线: ${c.user.tag}`);
  console.log(`📋 共加载 ${client.commands.size} 个命令`);
  console.log(`🏠 已在 ${c.guilds.cache.size} 个服务器中`);

  // 为所有已有服务器注册命令
  const commands = Array.from(client.commands.values()).map((cmd) => cmd.data);
  for (const guild of c.guilds.cache.values()) {
    try {
      await guild.commands.set(commands);
    } catch (e) {
      console.error(`❌ 注册命令到 ${guild.name} 失败:`, e);
    }
  }

  if (isShuttingDown) return;
  try {
    if (!isShuttingDown) stopMonitor = startMonitor(c);
  } catch (error) {
    console.error("❌ 初始化订阅数据库失败:", error);
    await client.destroy();
    closeStore();
    process.exit(1);
  }
});

client.login(DISCORD_BOT_TOKEN).catch((e) => {
  console.error("❌ 登录失败:", e);
  process.exit(1);
});

// ─── 5. 关闭 ────────────────────────────────────────────────────────
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("🛑 正在关闭 Bot...");
  await stopMonitor?.();
  await client.destroy();
  closeStore();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
