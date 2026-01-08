import { z } from "zod";

/**
 * Input data for a single lead to be ranked by AI
 */
export const leadRankingInputSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  companyDomain: z.string(),
  employeeRange: z.string(),
  industry: z.string().nullable(),
});

export type LeadRankingInput = z.infer<typeof leadRankingInputSchema>;

/**
 * AI output for ranking qualified leads (1-N)
 */
export const leadRankingOutputSchema = z.object({
  leadId: z.uuid(),
  rank: z.number().int().min(1).describe(
    "Rank within company qualified leads (1 = highest priority, N = lowest priority among qualified)"
  ),
  reasoning: z.string().describe(
    "Brief explanation of relative ranking priority (1-2 sentences)"
  ),
});

export type LeadRankingOutput = z.infer<typeof leadRankingOutputSchema>;

/**
 * Complete ranking result for qualified leads
 */
export const rankingResultSchema = z.object({
  sessionId: z.uuid(),
  rankedCount: z.number(),
  totalQualifiedLeads: z.number(),
  results: z.array(z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string(),
    companyName: z.string(),
    employeeRange: z.string(),
    companyRank: z.number(),
    reasoning: z.string(),
  })),
});

export type RankingResult = z.infer<typeof rankingResultSchema>;

/**
 * Schema for a single lead with company and two-phase ranking info
 */
export const leadWithRankingSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  employeeRange: z.string().nullable(),
  industry: z.string().nullable(),
  qualified: z.boolean().nullable(),
  companyRank: z.number().nullable(),
  qualificationReasoning: z.string().nullable(),
  rankingReasoning: z.string().nullable(),
  rankedAt: z.string().nullable(),
  uploadId: z.uuid().nullable(),
  uploadFilename: z.string().nullable(),
  createdAt: z.string(),
});

export type LeadWithRanking = z.infer<typeof leadWithRankingSchema>;
