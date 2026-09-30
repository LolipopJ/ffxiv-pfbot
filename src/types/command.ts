import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

/**
 * 所有斜杠命令模块必须遵循的导出契约
 */
export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
