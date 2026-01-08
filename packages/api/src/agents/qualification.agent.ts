import { z } from "zod";
import Handlebars from "handlebars";
import {
  leadQualificationOutputSchema,
  type LeadQualificationInput,
  type LeadQualificationOutput,
} from "../schemas/qualification";
import { AI_CONFIG } from "../config/constants";
import { services } from "../services";
import { utils } from "../utils";
import { logger } from "../utils/logger";

const QUALIFICATION_PROMPT_TEMPLATE = `
You are a lead qualification engine.

Your task is to determine whether each lead is a viable prospect
based solely on the provided persona specification.

You must output a binary decision:
- QUALIFIED: the lead should proceed to ranking
- DISQUALIFIED: the lead should be excluded from outreach

Do not rank leads. Ranking happens in a separate step.
Do not invent criteria or assumptions beyond what is explicitly stated
in the persona specification.


## Persona Specification

{{PERSONA_SPEC}}


## Decision Framework

For each lead, follow this process:

1. Identify any explicit inclusion requirements defined in the persona
   (e.g. required roles, departments, seniority, company size, industry).
2. Identify any explicit exclusion rules defined in the persona
   (e.g. excluded roles, seniority mismatches, non-employees).
3. Evaluate whether the lead satisfies all required inclusion criteria.
4. If the lead violates any exclusion rule or fails a required criterion,
   they must be DISQUALIFIED.


## Qualification Rules

- Qualification is a binary decision.
- A single explicit exclusion is sufficient to disqualify a lead.
- If the persona is ambiguous about a role, default to QUALIFIED.
- Do NOT disqualify based on inferred importance or assumed responsibilities.
- Do NOT use external knowledge.


## Output Requirements

For each lead, return:
1. **qualified**: boolean
2. **reasoning**: concise explanation (1–2 sentences) referencing persona rules


## Leads to Qualify

{{QUALIFIED_LEADS_LIST}}
`;

interface QualificationTemplateVariables {
  personaSpec: string;
  leadsSection: string;
}

interface QualifyLeadsParams {
  leads: LeadQualificationInput[];
  personaSpec: string;
}

interface RetryMissingParams {
  missingLeads: LeadQualificationInput[];
  personaSpec: string;
  qualifications: LeadQualificationOutput[];
}

interface CallQualificationAIParams {
  prompt: string;
  context: string;
}

export class QualificationAgent {
  private static instance: QualificationAgent;

  private constructor() { }

  static getInstance(): QualificationAgent {
    if (!QualificationAgent.instance) {
      QualificationAgent.instance = new QualificationAgent();
    }
    return QualificationAgent.instance;
  }

  /** Qualifies a batch of leads against the persona spec, returns qualification decisions */
  async qualifyLeads({ leads, personaSpec }: QualifyLeadsParams): Promise<LeadQualificationOutput[]> {
    if (leads.length === 0) return [];

    const prompt = this.buildPrompt({ leads, personaSpec });

    try {
      const result = await this.callQualificationAI({ prompt, context: "Qualification Agent" });
      const qualifications = [...result.qualifications];

      await this.handleIncompleteQualifications({ leads, personaSpec, qualifications });

      return qualifications;
    } catch (error) {
      logger.error("AI qualification", error, { leadsCount: leads.length });
      return this.createErrorFallbackQualifications(leads);
    }
  }

  /** Calls OpenAI to get qualification decisions using structured output */
  private async callQualificationAI({ prompt, context }: CallQualificationAIParams) {
    return services.openai.generateObject({
      model: AI_CONFIG.QUALIFICATION_MODEL,
      schema: z.object({
        qualifications: z.array(leadQualificationOutputSchema),
      }),
      prompt,
      context,
    });
  }

  /** Handles missing qualifications by retrying and adding fallbacks */
  private async handleIncompleteQualifications({
    leads,
    personaSpec,
    qualifications,
  }: {
    leads: LeadQualificationInput[];
    personaSpec: string;
    qualifications: LeadQualificationOutput[];
  }): Promise<void> {
    const missingLeads = utils.findMissingItems(leads, qualifications);

    if (missingLeads.length === 0) return;

    logger.warn("Qualification Agent", "AI returned incomplete qualifications", {
      batchSize: leads.length,
      receivedCount: qualifications.length,
      missingCount: missingLeads.length,
    });

    await this.retryMissingLeads({ missingLeads, personaSpec, qualifications });

    // Add fallback for any still-missing leads
    const stillMissing = utils.findMissingItems(leads, qualifications);
    if (stillMissing.length > 0) {
      const fallback = this.createFallbackQualifications(stillMissing);
      qualifications.push(...fallback);
    }
  }

  /** Creates fallback qualifications for leads that weren't returned by AI */
  private createFallbackQualifications(missingLeads: LeadQualificationInput[]): LeadQualificationOutput[] {
    return missingLeads.map((lead) => ({
      leadId: lead.id,
      qualified: false,
      reasoning: "AI did not return qualification decision after retry",
    }));
  }

  /** Creates fallback qualifications when AI call fails entirely */
  private createErrorFallbackQualifications(leads: LeadQualificationInput[]): LeadQualificationOutput[] {
    return leads.map((lead) => ({
      leadId: lead.id,
      qualified: false,
      reasoning: "Error during AI qualification",
    }));
  }

  /** Retries qualification for leads that were missing from initial response */
  private async retryMissingLeads({
    missingLeads,
    personaSpec,
    qualifications,
  }: RetryMissingParams): Promise<boolean> {
    logger.warn("Qualification Agent", "Retrying missing leads in separate batch", {
      missingCount: missingLeads.length,
    });

    try {
      const retryPrompt = this.buildPrompt({ leads: missingLeads, personaSpec });
      const retryResult = await this.callQualificationAI({ prompt: retryPrompt, context: "Qualification Agent Retry" });

      const newQualifications = this.deduplicateQualifications(qualifications, retryResult.qualifications);
      qualifications.push(...newQualifications);

      logger.info("Qualification Agent", "Retry successful", {
        additionalQualifications: newQualifications.length,
      });

      return true;
    } catch (retryError) {
      logger.error("AI qualification retry", retryError, {
        missingLeadsCount: missingLeads.length,
      });
      return false;
    }
  }

  /** Filters out qualifications that already exist in the results */
  private deduplicateQualifications(
    existing: LeadQualificationOutput[],
    newQualifications: LeadQualificationOutput[]
  ): LeadQualificationOutput[] {
    const existingLeadIds = new Set(existing.map((q) => q.leadId));
    return newQualifications.filter((q) => !existingLeadIds.has(q.leadId));
  }

  /** Builds the qualification prompt with persona spec and leads */
  private buildPrompt({ leads, personaSpec }: QualifyLeadsParams): string {
    if (leads.length === 0) return "";

    const variables: QualificationTemplateVariables = {
      personaSpec,
      leadsSection: this.buildLeadsSection(leads),
    };

    const template = Handlebars.compile(QUALIFICATION_PROMPT_TEMPLATE);
    return template(variables);
  }

  /** Formats a single lead for inclusion in the prompt */
  private formatLeadForPrompt(lead: LeadQualificationInput, index: number): string {
    return `${index + 1}. ${lead.firstName} ${lead.lastName} - ${lead.jobTitle}
   Company: ${lead.companyName} (${lead.employeeRange || "Unknown size"})
   Industry: ${lead.industry || "Not specified"}
   ID: ${lead.id}`;
  }

  /** Builds the leads section by formatting all leads */
  private buildLeadsSection(leads: LeadQualificationInput[]): string {
    return leads.map((lead, idx) => this.formatLeadForPrompt(lead, idx)).join("\n\n");
  }
}

export const qualificationAgent = QualificationAgent.getInstance();
