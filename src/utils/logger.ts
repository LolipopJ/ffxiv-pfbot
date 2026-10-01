type LogContext = Record<string, unknown>;

type LogLevel = "INFO" | "WARN" | "ERROR";
const LOG_EMOJI: Record<LogLevel, string> = {
  INFO: "ℹ️",
  WARN: "⚠️",
  ERROR: "❌",
};

function write(
  level: LogLevel,
  module: string,
  message: string,
  context: LogContext = {},
) {
  const { error, ...details } = context;
  const suffix = Object.keys(details).length
    ? ` ${JSON.stringify(details)}`
    : "";
  const text = `[${new Date().toISOString()}] [${LOG_EMOJI[level]}] [${module}] ${message}${suffix}`;
  const output =
    level === "ERROR"
      ? console.error
      : level === "WARN"
        ? console.warn
        : console.log;
  if (error !== undefined) output(text, error);
  else output(text);
}

export const logger = {
  info: (module: string, message: string, context?: LogContext) =>
    write("INFO", module, message, context),
  warn: (module: string, message: string, context?: LogContext) =>
    write("WARN", module, message, context),
  error: (module: string, message: string, context?: LogContext) =>
    write("ERROR", module, message, context),
};
