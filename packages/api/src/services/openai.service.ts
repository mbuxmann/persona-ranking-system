import { createOpenAI } from "@ai-sdk/openai";
import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { env } from "@leads/env/server";
import { logger } from "../utils/logger";
import { RANKING_CONFIG } from "../config/constants";

/** OpenAI model identifier (e.g., "gpt-4o", "gpt-4o-mini") */
type ModelType = string;

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  context?: string;
}

interface GenerateTextOptions {
  model: ModelType;
  prompt: string;
  context?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

interface GenerateObjectOptions<T extends z.ZodTypeAny> {
  model: ModelType;
  prompt: string;
  schema: T;
  context?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

/**
 * OpenAI Service
 * Handles AI text and object generation with retry logic
 */
export class OpenAIService {
  private static instance: OpenAIService;
  private client: ReturnType<typeof createOpenAI>;

  private constructor() {
    this.client = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
    });
  }

  static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  /** Generates text using the specified model with automatic retry */
  async generateText({
    model,
    prompt,
    context = "OpenAI Service",
    maxRetries,
    initialDelayMs,
  }: GenerateTextOptions): Promise<string> {
    const result = await this.retryWithBackoff(
      () =>
        aiGenerateText({
          model: this.client(model),
          prompt,
        }),
      { context, maxRetries, initialDelayMs }
    );

    return result.text;
  }

  /** Generates a structured object matching the provided Zod schema */
  async generateObject<T extends z.ZodTypeAny>({
    model,
    prompt,
    schema,
    context = "OpenAI Service",
    maxRetries,
    initialDelayMs,
  }: GenerateObjectOptions<T>): Promise<z.infer<T>> {
    const result = await this.retryWithBackoff(
      () =>
        aiGenerateText({
          model: this.client(model),
          output: Output.object({ schema }),
          prompt,
        }),
      { context, maxRetries, initialDelayMs }
    );

    return result.output as z.infer<T>;
  }

  /** Checks if an error is a rate limit error */
  private isRateLimitError(error: Error): boolean {
    return (
      error.message.includes("429") ||
      error.message.includes("rate limit") ||
      error.message.toLowerCase().includes("too many requests")
    );
  }

  /** Retries a function with exponential backoff on rate limit errors */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = RANKING_CONFIG.AI_MAX_RETRIES,
      initialDelayMs = RANKING_CONFIG.AI_INITIAL_DELAY_MS,
      context = "AI call",
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRateLimitError(lastError) || attempt === maxRetries) {
          throw lastError;
        }

        const delayMs = initialDelayMs * Math.pow(2, attempt);
        logger.warn(context, "Rate limit hit, retrying", {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          delayMs,
        });

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError ?? new Error("Retry failed");
  }
}

export const openaiService = OpenAIService.getInstance();
