import { z } from "zod";
import { TriggerRunStatus } from "../utils/trigger";

/**
 * Shared metrics schema for prompt evaluation results
 */
const promptMetricsSchema = z.object({
  mae: z.number().nullable(),
  rmse: z.number().nullable(),
  spearmanCorrelation: z.number().nullable(),
  kendallTau: z.number().nullable(),
});

/**
 * Full prompt version schema (used for list/get endpoints)
 */
export const promptVersionSchema = z.object({
  id: z.string(),
  version: z.string(),
  iterationNumber: z.number(),
  optimizationRunId: z.string().nullable(),
  promptText: z.string(),
  isActive: z.boolean(),
  isBaseline: z.boolean(),
  beamRank: z.number().nullable(),
  createdAt: z.string(),
  deployedAt: z.string().nullable(),
}).merge(promptMetricsSchema);

/**
 * Subset of prompt version (for getPrompt/getActivePrompt)
 */
export const promptVersionSummarySchema = z.object({
  id: z.string(),
  version: z.string(),
  promptText: z.string(),
  isActive: z.boolean(),
  isBaseline: z.boolean(),
  createdAt: z.string(),
}).merge(promptMetricsSchema);

/**
 * Active prompt response (minimal fields)
 */
export const activePromptSchema = z.object({
  id: z.string(),
  promptText: z.string(),
  version: z.string(),
}).merge(promptMetricsSchema);

/**
 * Optimization run status (subset of TriggerRunStatus for DB storage)
 */
export const optimizationRunStatusSchema = z.enum(["running", "completed", "failed"]);

/**
 * Optimization run schema
 */
export const optimizationRunSchema = z.object({
  id: z.string(),
  status: optimizationRunStatusSchema,
  startingPromptId: z.string(),
  bestPromptId: z.string().nullable(),
  totalIterations: z.number().nullable(),
  totalPromptsGenerated: z.number().nullable(),
  improvementPercentage: z.number().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

/**
 * Optimization workflow output (returned when job completes)
 */
export const optimizationOutputSchema = z.object({
  success: z.boolean(),
  runId: z.string(),
  bestPromptId: z.string(),
  improvementPercentage: z.number(),
});

/**
 * Job status response schema
 */
export const optimizationStatusSchema = z.object({
  status: z.nativeEnum(TriggerRunStatus),
  isCompleted: z.boolean(),
  output: optimizationOutputSchema.optional(),
});

/**
 * Export results response schema
 */
export const evaluationExportSchema = z.object({
  csv: z.string(),
  filename: z.string(),
});

/**
 * Input for starting prompt optimization
 */
export const startOptimizationInputSchema = z.object({
  startingPromptId: z.string(),
  maxIterations: z.number().int().min(1).max(10).default(5),
  variantsPerIteration: z.number().int().min(4).max(16).default(8),
  beamWidth: z.number().int().min(2).max(5).default(3),
});

/**
 * Input for prompt ID operations (get, deploy, export)
 */
export const promptIdInputSchema = z.object({
  promptId: z.string(),
});

/**
 * Input for job ID operations (status polling)
 */
export const jobIdInputSchema = z.object({
  jobId: z.string(),
});

/**
 * Generic success response
 */
export const successResponseSchema = z.object({
  success: z.boolean(),
});

/**
 * Job ID response (for optimization start)
 */
export const jobIdResponseSchema = z.object({
  jobId: z.string(),
});

// Types
export type PromptVersion = z.infer<typeof promptVersionSchema>;
export type PromptVersionSummary = z.infer<typeof promptVersionSummarySchema>;
export type ActivePrompt = z.infer<typeof activePromptSchema>;
export type OptimizationRun = z.infer<typeof optimizationRunSchema>;
export type OptimizationStatus = z.infer<typeof optimizationStatusSchema>;
export type EvaluationExport = z.infer<typeof evaluationExportSchema>;
export type StartOptimizationInput = z.infer<typeof startOptimizationInputSchema>;
export type PromptIdInput = z.infer<typeof promptIdInputSchema>;
export type JobIdInput = z.infer<typeof jobIdInputSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;
export type JobIdResponse = z.infer<typeof jobIdResponseSchema>;
