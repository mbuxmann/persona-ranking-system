import { publicProcedure } from "../index";
import { services } from "../services";
import { jobIdSchema, jobStatusOutputSchema } from "../schemas/jobs";

/**
 * Ranking Router
 * Handles ranking operations for qualified leads
 */
export const rankingRouter = {
  /**
   * Rank all qualified leads
   * Execution mode (async queue or direct sync) is controlled by USE_TRIGGER_QUEUES env var
   */
  rankAllLeads: publicProcedure
    .output(jobIdSchema)
    .handler(async () => services.ranking.startRankingWorkflow()),

  /**
   * Get status of a ranking job
   */
  status: publicProcedure
    .input(jobIdSchema)
    .output(jobStatusOutputSchema)
    .handler(async ({ input }) => services.ranking.getJobStatus(input.jobId)),
};
