import { z } from "zod";

/**
 * Input for lead qualification
 */
export const leadQualificationInputSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  companyDomain: z.string(),
  employeeRange: z.string(),
  industry: z.string().nullable(),
});

export type LeadQualificationInput = z.infer<typeof leadQualificationInputSchema>;

/**
 * AI output for qualification
 */
export const leadQualificationOutputSchema = z.object({
  leadId: z.uuid(),
  qualified: z.boolean().describe(
    "Does this lead match persona criteria? False if wrong department, too junior/senior, investor, advisor, or other exclusion."
  ),
  reasoning: z.string().describe(
    "Brief explanation of qualification decision (1-2 sentences)"
  ),
});

export type LeadQualificationOutput = z.infer<typeof leadQualificationOutputSchema>;

/**
 * Qualification result for a company
 */
export const qualificationResultSchema = z.object({
  sessionId: z.uuid(),
  companyName: z.string(),
  totalLeads: z.number(),
  qualifiedCount: z.number(),
  disqualifiedCount: z.number(),
  qualifications: z.array(z.object({
    leadId: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string(),
    qualified: z.boolean(),
    reasoning: z.string(),
  })),
});

export type QualificationResult = z.infer<typeof qualificationResultSchema>;
