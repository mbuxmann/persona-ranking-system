import { publicProcedure } from "../index";
import { services } from "../services";
import {
  promptVersionSchema,
  promptVersionSummarySchema,
  activePromptSchema,
  optimizationRunSchema,
  optimizationStatusSchema,
  evaluationExportSchema,
  startOptimizationInputSchema,
  promptIdInputSchema,
  jobIdInputSchema,
  successResponseSchema,
  jobIdResponseSchema,
} from "../schemas/prompt-optimization";

/**
 * Prompt Optimization Router
 * Handles prompt version management and AI-powered optimization via beam search
 */
export const promptOptimizationRouter = {
  /**
   * List all prompt versions
   * Returns versions sorted by creation date with metrics
   */
  listPrompts: publicProcedure
    .output(promptVersionSchema.array())
    .handler(async () => services.promptOptimization.listPrompts()),

  /**
   * Get a specific prompt version by ID
   */
  getPrompt: publicProcedure
    .input(promptIdInputSchema)
    .output(promptVersionSummarySchema)
    .handler(async ({ input }) => services.promptOptimization.getPrompt(input.promptId)),

  /**
   * Get the currently deployed (active) prompt
   */
  getActivePrompt: publicProcedure
    .output(activePromptSchema)
    .handler(async () => services.promptOptimization.getActivePrompt()),

  /**
   * Start beam search optimization
   * Generates and evaluates prompt variants to find the best performer
   * Returns job ID for status polling
   */
  startOptimization: publicProcedure
    .input(startOptimizationInputSchema)
    .output(jobIdResponseSchema)
    .handler(async ({ input }) => services.promptOptimization.startOptimization(input)),

  /**
   * Poll optimization job status
   * Returns completion state and results when done
   */
  getOptimizationStatus: publicProcedure
    .input(jobIdInputSchema)
    .output(optimizationStatusSchema)
    .handler(async ({ input }) => services.promptOptimization.getOptimizationStatus(input.jobId)),

  /**
   * List all past optimization runs
   * Returns run metadata including improvement metrics
   */
  listOptimizationRuns: publicProcedure
    .output(optimizationRunSchema.array())
    .handler(async () => services.promptOptimization.listOptimizationRuns()),

  /**
   * Deploy a prompt version as the active prompt
   * Used for lead ranking going forward
   */
  deployPrompt: publicProcedure
    .input(promptIdInputSchema)
    .output(successResponseSchema)
    .handler(async ({ input }) => {
      await services.promptOptimization.deployPrompt(input.promptId);
      return { success: true };
    }),

  /**
   * Export evaluation results for a prompt version
   * Returns CSV with predicted vs actual rankings
   */
  exportEvaluationResults: publicProcedure
    .input(promptIdInputSchema)
    .output(evaluationExportSchema)
    .handler(async ({ input }) => services.promptOptimization.exportEvaluationResults(input.promptId)),
};
