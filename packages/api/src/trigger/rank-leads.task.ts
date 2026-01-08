import { task } from "@trigger.dev/sdk";
import { services } from "../services";
import { TASK_IDS } from "../config/constants";
import { rankLeadsPayloadSchema, type RankLeadsPayload } from "../schemas/trigger-payloads";

export const rankLeadsTask = task({
  id: TASK_IDS.RANK_LEADS,
  retry: {
    maxAttempts: 3,
  },
  queue: {
    concurrencyLimit: 3,
  },
  run: async (payload: RankLeadsPayload, { ctx }) => {
    const validatedPayload = rankLeadsPayloadSchema.parse(payload);

    return await services.ranking.rankLeadsWorkflow({
      ...validatedPayload,
      jobId: ctx.run.id,
    });
  },
});
