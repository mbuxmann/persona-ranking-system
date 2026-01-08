import { z } from "zod";
import { csvRowSchema } from "./csv";

/**
 * Payload schema for rank-leads task
 */
export const rankLeadsPayloadSchema = z.object({
  leadIds: z.array(z.string().uuid()).optional(),
});

export type RankLeadsPayload = z.infer<typeof rankLeadsPayloadSchema>;

/**
 * Payload schema for import-csv task
 */
export const importCsvPayloadSchema = z.object({
  csvData: z.array(csvRowSchema),
  filename: z.string().min(1),
  uploadId: z.string().uuid(),
});

export type ImportCsvPayload = z.infer<typeof importCsvPayloadSchema>;

/**
 * Payload schema for optimize-prompt task
 */
export const optimizePromptPayloadSchema = z.object({
  startingPromptId: z.string().uuid(),
  maxIterations: z.number().int().min(1).max(10).optional(),
  variantsPerIteration: z.number().int().min(4).max(16).optional(),
  beamWidth: z.number().int().min(2).max(5).optional(),
});

export type OptimizePromptPayload = z.infer<typeof optimizePromptPayloadSchema>;
