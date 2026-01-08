import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    OPENROUTER_API_KEY: z.string().min(1),
    TRIGGER_API_KEY: z.string().min(1),
    TRIGGER_SECRET_KEY: z.string().min(1),
    USE_TRIGGER_QUEUES: z
      .string()
      .default("false")
      .transform((val) => val === "true")
      .describe(
        "Enable async task execution via Trigger.dev queues (true) or direct synchronous workflow calls (false). " +
        "Recommended: false for dev/test (faster feedback), true for production (scalable queues)."
      ),
    OPENROUTER_QUALIFICATION_MODEL: z.string().default("openai/gpt-5-mini"),
    OPENROUTER_RANKING_MODEL: z.string().default("openai/gpt-5-mini"),
    OPENROUTER_GRADIENT_MODEL: z.string().default("openai/gpt-5-mini"),
    OPENROUTER_VARIANT_MODEL: z.string().default("openai/gpt-5-mini"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
