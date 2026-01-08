import { task, logger } from "@trigger.dev/sdk";
import { services } from "../services";
import { TASK_IDS } from "../config/constants";
import { rankLeadsPayloadSchema, type RankLeadsPayload } from "../schemas/trigger-payloads";

export const rankLeadsTask = task({
  id: TASK_IDS.RANK_LEADS,
  retry: {
    maxAttempts: 3,
  },
  machine: "small-2x",
  queue: {
    concurrencyLimit: 3,
  },
  run: async (payload: RankLeadsPayload, { ctx }) => {
    const validatedPayload = rankLeadsPayloadSchema.parse(payload);

    logger.info("Starting rank leads workflow", {
      leadIdsCount: validatedPayload.leadIds?.length ?? "all",
    });

    const result = await services.ranking.rankLeadsWorkflow({
      ...validatedPayload,
      jobId: ctx.run.id,
    });

    logger.info("Rank leads workflow complete", {
      totalQualifiedLeads: result.totalQualifiedLeads,
      rankedCount: result.rankedCount,
    });

    return result;
  },
});
