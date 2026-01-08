import pino from "pino";

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transport: process.env.NODE_ENV !== "production"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: process.env.NODE_ENV === "production"
    ? {
        level: (label) => ({ level: label }),
      }
    : undefined,
});

function error(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  pinoLogger.error({ context, err: errorObj, ...metadata }, `[${context}] ${errorObj.message}`);
}

function warn(context: string, message: string, metadata?: Record<string, unknown>): void {
  pinoLogger.warn({ context, ...metadata }, `[${context}] ${message}`);
}

function info(context: string, message: string, metadata?: Record<string, unknown>): void {
  pinoLogger.info({ context, ...metadata }, `[${context}] ${message}`);
}

function debug(context: string, message: string, data?: Record<string, unknown>): void {
  pinoLogger.debug({ context, ...data }, `[${context}] ${message}`);
}

export const logger = {
  error,
  warn,
  info,
  debug,
  child: (bindings: Record<string, unknown>) => {
    const childLogger = pinoLogger.child(bindings);
    return {
      error: (context: string, err: unknown, metadata?: Record<string, unknown>) => {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        childLogger.error({ context, err: errorObj, ...metadata }, `[${context}] ${errorObj.message}`);
      },
      warn: (context: string, message: string, metadata?: Record<string, unknown>) => {
        childLogger.warn({ context, ...metadata }, `[${context}] ${message}`);
      },
      info: (context: string, message: string, metadata?: Record<string, unknown>) => {
        childLogger.info({ context, ...metadata }, `[${context}] ${message}`);
      },
      debug: (context: string, message: string, data?: Record<string, unknown>) => {
        childLogger.debug({ context, ...data }, `[${context}] ${message}`);
      },
    };
  },
};
