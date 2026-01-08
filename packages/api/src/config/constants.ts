import { env } from "@leads/env/server";

export const IMPORT_CONFIG = {
  CHUNK_THRESHOLD: 200,
  CHUNK_SIZE: 100,
} as const;

export const QUALIFICATION_CONFIG = {
  BATCH_SIZE: 50,
  CONCURRENCY: 10,
} as const;

export const RANKING_CONFIG = {
  MAX_BATCH_SIZE: 50,
  AI_MAX_RETRIES: 3,
  AI_INITIAL_DELAY_MS: 500,
  CONCURRENCY: 20,
} as const;

export const API_CONFIG = {
  HISTORY_LIMIT: 50,
} as const;

export const TASK_IDS = {
  IMPORT_CSV: "import-csv",
  RANK_LEADS: "rank-leads",
  OPTIMIZE_PROMPT: "optimize-prompt",
} as const;

export const AI_CONFIG = {
  QUALIFICATION_MODEL: env.OPENROUTER_QUALIFICATION_MODEL,
  RANKING_MODEL: env.OPENROUTER_RANKING_MODEL,
  GRADIENT_MODEL: env.OPENROUTER_GRADIENT_MODEL,
  VARIANT_MODEL: env.OPENROUTER_VARIANT_MODEL,
} as const;
