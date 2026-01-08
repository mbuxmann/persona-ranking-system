import { task } from "@trigger.dev/sdk";
import { services } from "../services";
import { TASK_IDS } from "../config/constants";
import { optimizePromptPayloadSchema, type OptimizePromptPayload } from "../schemas/trigger-payloads";

export const optimizePromptTask = task({
  id: TASK_IDS.OPTIMIZE_PROMPT,
  retry: {
    maxAttempts: 1,
  },
  maxDuration: 3600,
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: OptimizePromptPayload, { ctx }) => {
    const validatedPayload = optimizePromptPayloadSchema.parse(payload);

    return await services.promptOptimization.optimizePromptWorkflow({
      startingPromptId: validatedPayload.startingPromptId,
      maxIterations: validatedPayload.maxIterations,
      variantsPerIteration: validatedPayload.variantsPerIteration,
      beamWidth: validatedPayload.beamWidth,
      jobId: ctx.run.id,
    });
  },
});
