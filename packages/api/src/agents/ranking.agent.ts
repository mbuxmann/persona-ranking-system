import { z } from "zod";
import Handlebars from "handlebars";
import {
  leadRankingOutputSchema,
  type LeadRankingInput,
} from "../schemas/ranking";
import { PERSONA_SPEC } from "../config/persona-spec";
import { AI_CONFIG } from "../config/constants";
import { services } from "../services";
import { utils } from "../utils";
import { logger } from "../utils/logger";

type RankingResult = z.infer<typeof leadRankingOutputSchema>;

interface RankLeadsParams {
  leads: LeadRankingInput[];
  promptTemplate: string;
}

interface RetryMissingParams {
  missingLeads: LeadRankingInput[];
  promptTemplate: string;
  rankings: RankingResult[];
}

interface CallRankingAIParams {
  prompt: string;
  context: string;
}

interface TemplateVariables {
  PERSONA_SPEC: string;
  QUALIFIED_LEADS_COUNT: number;
  COMPANY_NAME: string;
  COMPANY_DOMAIN: string;
  EMPLOYEE_RANGE: string;
  INDUSTRY: string;
  QUALIFIED_LEADS_LIST: string;
}

export class RankingAgent {
  private static instance: RankingAgent;

  private constructor() { }

  static getInstance(): RankingAgent {
    if (!RankingAgent.instance) {
      RankingAgent.instance = new RankingAgent();
    }
    return RankingAgent.instance;
  }

  /** Ranks qualified leads for a company, returns ranking results with scores and reasoning */
  async rankQualifiedLeads({
    leads,
    promptTemplate,
  }: RankLeadsParams): Promise<RankingResult[]> {
    if (leads.length === 0) {
      return [];
    }

    try {
      return await this.performRanking({ leads, promptTemplate });
    } catch (error) {
      logger.error("AI ranking", error, {
        companyName: leads[0]?.companyName,
        leadsCount: leads.length,
      });
      return [];
    }
  }

  /** Executes the full ranking pipeline: AI call, validation, retry, and transformation */
  private async performRanking({ leads, promptTemplate }: RankLeadsParams): Promise<RankingResult[]> {
    const prompt = this.substitutePromptVariables({ leads, promptTemplate });

    const result = await this.callRankingAI({ prompt, context: "Ranking Agent" });

    const validRankings = this.validateAndFilterRankings(result.rankings, leads, "Ranking Agent");

    const rankings = await this.handleMissingLeads({
      leads,
      promptTemplate,
      validRankings,
    });

    return this.transformRankingsOutput(rankings);
  }

  /** Calls OpenAI to rank leads using structured output */
  private async callRankingAI({ prompt, context }: CallRankingAIParams) {
    return services.openai.generateObject({
      model: AI_CONFIG.RANKING_MODEL,
      schema: z.object({
        rankings: z.array(leadRankingOutputSchema),
      }),
      prompt,
      context,
    });
  }

  /** Filters out invalid rankings that don't match input leads */
  private validateAndFilterRankings(
    rankings: RankingResult[],
    leads: LeadRankingInput[],
    context: string
  ): RankingResult[] {
    return utils.filterInvalidItems(rankings, leads, context);
  }

  /** Detects and retries ranking for leads missing from AI response */
  private async handleMissingLeads({
    leads,
    promptTemplate,
    validRankings,
  }: {
    leads: LeadRankingInput[];
    promptTemplate: string;
    validRankings: RankingResult[];
  }): Promise<RankingResult[]> {
    const missingLeads = utils.findMissingItems(leads, validRankings);
    const rankings = [...validRankings];

    if (missingLeads.length > 0) {
      logger.warn("Ranking Agent", "AI returned incomplete rankings", {
        companyName: leads[0]?.companyName,
        expectedCount: leads.length,
        receivedCount: validRankings.length,
        missingCount: missingLeads.length,
      });

      await this.retryMissingLeads({ missingLeads, promptTemplate, rankings });
    }

    return rankings;
  }

  /** Extracts only the required fields from ranking results */
  private transformRankingsOutput(rankings: RankingResult[]): RankingResult[] {
    return rankings.map((r) => ({
      leadId: r.leadId,
      rank: r.rank,
      reasoning: r.reasoning,
    }));
  }

  /** Retries ranking for leads that were missing from initial response */
  private async retryMissingLeads({
    missingLeads,
    promptTemplate,
    rankings,
  }: RetryMissingParams): Promise<boolean> {
    const companyName = missingLeads[0]?.companyName || "Unknown";

    logger.warn("Ranking Agent", "Retrying missing leads in separate batch", {
      missingCount: missingLeads.length,
      companyName,
    });

    try {
      const retryPrompt = this.substitutePromptVariables({ leads: missingLeads, promptTemplate });
      const retryResult = await this.callRankingAI({ prompt: retryPrompt, context: "Ranking Agent Retry" });

      const validRetryRankings = this.validateAndFilterRankings(
        retryResult.rankings,
        missingLeads,
        "Ranking Agent Retry"
      );

      const newRankings = this.deduplicateRankings(rankings, validRetryRankings);
      rankings.push(...newRankings);

      logger.info("Ranking Agent", "Retry successful", {
        additionalRankings: newRankings.length,
      });

      return true;
    } catch (retryError) {
      logger.error("AI ranking retry", retryError, {
        companyName,
        missingLeadsCount: missingLeads.length,
      });
      return false;
    }
  }

  /** Filters out rankings that already exist in the results */
  private deduplicateRankings(
    existing: RankingResult[],
    newRankings: RankingResult[]
  ): RankingResult[] {
    const existingLeadIds = new Set(existing.map(r => r.leadId));
    return newRankings.filter(r => !existingLeadIds.has(r.leadId));
  }

  /** Compiles the prompt template with lead and company data */
  private substitutePromptVariables({ leads, promptTemplate }: RankLeadsParams): string {
    const company = leads[0];
    if (!company) return promptTemplate;

    const variables = this.buildTemplateVariables(company, leads);
    const template = Handlebars.compile(promptTemplate);

    return template(variables);
  }

  /** Formats leads as numbered list for template insertion */
  private formatLeadsForTemplate(leads: LeadRankingInput[]): string {
    return leads
      .map((lead, idx) => {
        const name = `${lead.firstName} ${lead.lastName}`;
        return `${idx + 1}. ${name} - ${lead.jobTitle} (ID: ${lead.id})`;
      })
      .join("\n");
  }

  /** Builds the template variables object from company and leads data */
  private buildTemplateVariables(company: LeadRankingInput, leads: LeadRankingInput[]): TemplateVariables {
    return {
      PERSONA_SPEC: PERSONA_SPEC,
      QUALIFIED_LEADS_COUNT: leads.length,
      COMPANY_NAME: company.companyName,
      COMPANY_DOMAIN: company.companyDomain,
      EMPLOYEE_RANGE: company.employeeRange,
      INDUSTRY: company.industry || "Not specified",
      QUALIFIED_LEADS_LIST: this.formatLeadsForTemplate(leads),
    };
  }
}

export const rankingAgent = RankingAgent.getInstance();
