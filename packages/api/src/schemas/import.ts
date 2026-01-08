import { z } from "zod";
import { TriggerRunStatus } from "../utils/trigger";

/**
 * Schema for import job output
 * Returned when import job completes successfully
 * Updated for two-phase system: qualification → ranking
 */
export const importJobOutputSchema = z.object({
  success: z.boolean(),
  companiesAdded: z.number(),
  companiesUpdated: z.number(),
  leadsAdded: z.number(),
  leadsSkipped: z.number(),
  totalRows: z.number(),
  qualifiedCount: z.number(),
  rankedCount: z.number(),
  rankingJobId: z.string().nullable(),
});

/**
 * Schema for import job status
 * Combines job metadata with output
 */
export const importJobStatusSchema = z.object({
  id: z.string(),
  status: z.enum(TriggerRunStatus),
  isCompleted: z.boolean(),
  isFailed: z.boolean(),
  output: importJobOutputSchema.optional(),
});

/**
 * TypeScript types
 */
export type ImportJobOutput = z.infer<typeof importJobOutputSchema>;
export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;
