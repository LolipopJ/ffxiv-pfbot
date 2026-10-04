import { type Locale, locale } from "../locales";
import type { LogEvent, LogModule } from "../types/locale";

type LogContext = Record<string, unknown>;

type LogLevel = "INFO" | "WARN" | "ERROR";
const LOG_EMOJI: Record<LogLevel, string> = {
  INFO: "ℹ️",
  WARN: "⚠️",
  ERROR: "❌",
};

function write(
  level: LogLevel,
  language: Locale,
  module: LogModule,
  message: LogEvent,
  context: LogContext = {},
) {
  const { error, ...details } = context;
  const suffix = Object.keys(details).length
    ? ` ${JSON.stringify(details)}`
    : "";
  const logs = language.messages.logs;
  const text = `[${new Date().toISOString()}] [${LOG_EMOJI[level]}] [${logs.modules[module]}] ${logs.events[message]}${suffix}`;
  const output =
    level === "ERROR"
      ? console.error
      : level === "WARN"
        ? console.warn
        : console.log;
  if (error !== undefined) output(text, error);
  else output(text);
}

export function createLogger(language: Locale = locale) {
  return {
    info: (module: LogModule, message: LogEvent, context?: LogContext) =>
      write("INFO", language, module, message, context),
    warn: (module: LogModule, message: LogEvent, context?: LogContext) =>
      write("WARN", language, module, message, context),
    error: (module: LogModule, message: LogEvent, context?: LogContext) =>
      write("ERROR", language, module, message, context),
  };
}

export const logger = createLogger();
