import { z } from "zod";

/**
 * Schema for validating qualification agent outputs
 * Ensures AI responses have valid structure before DB writes
 */
export const qualificationOutputSchema = z.object({
  leadId: z.string().uuid(),
  qualified: z.boolean(),
  reasoning: z.string().max(2000),
});

export const qualificationOutputArraySchema = z.array(qualificationOutputSchema);

/**
 * Schema for validating ranking agent outputs
 * Ensures AI responses have valid structure before DB writes
 */
export const rankingOutputSchema = z.object({
  leadId: z.string().uuid(),
  rank: z.number().min(0).max(100),
  reasoning: z.string().max(2000),
});

export const rankingOutputArraySchema = z.array(rankingOutputSchema);

export type QualificationAgentOutput = z.infer<typeof qualificationOutputSchema>;
export type RankingAgentOutput = z.infer<typeof rankingOutputSchema>;
