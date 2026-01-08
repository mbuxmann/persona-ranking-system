import { z } from "zod";
import { TriggerRunStatus } from "../utils/trigger";

/**
 * Schema for job ID input/output
 */
export const jobIdSchema = z.object({
  jobId: z.string(),
});

/**
 * Schema for job status output
 */
export const jobStatusOutputSchema = z.object({
  id: z.string(),
  status: z.enum(TriggerRunStatus),
  isCompleted: z.boolean(),
  isFailed: z.boolean(),
  output: z.unknown().optional(),
});

/**
 * TypeScript types
 */
export type JobId = z.infer<typeof jobIdSchema>;
export type JobStatusOutput = z.infer<typeof jobStatusOutputSchema>;
