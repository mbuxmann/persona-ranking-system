import { db } from "@leads/db";
import { companies, leads, promptVersions } from "@leads/db/schema/index";
import { and, eq, inArray, sql } from "@leads/db/drizzle";
import { randomUUID } from "crypto";
import { parallel } from "radash";
import { runs } from "@trigger.dev/sdk";
import {
  type LeadRankingInput,
  type RankingResult,
} from "../schemas/ranking";
import type { JobStatusOutput } from "../schemas/jobs";
import { rankingAgent } from "../agents/ranking.agent";
import { logger } from "../utils/logger";
import { executeRankingWorkflow } from "../utils/task-executor";
import { isFailedStatus, isCompletedStatus, TriggerRunStatus } from "../utils/trigger";
import { rankingOutputArraySchema } from "../schemas/agent-outputs";
import { qualificationService } from "./qualification.service";
import { RANKING_CONFIG } from "../config/constants";

type LeadWithCompany = {
  leadId: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  companyId: string;
  companyName: string;
  companyDomain: string;
  employeeRange: string | null;
  industry: string | null;
};

interface RankQualifiedLeadsParams {
  grouped: Map<string, LeadRankingInput[]>;
  sessionId: string;
  rankedAt: Date;
  promptTemplate: string;
}

/**
 * Ranking Service
 * Handles lead ranking within companies using AI-powered scoring
 */
export class RankingService {
  private static instance: RankingService;

  private constructor() { }

  static getInstance(): RankingService {
    if (!RankingService.instance) {
      RankingService.instance = new RankingService();
    }
    return RankingService.instance;
  }

  /** Starts ranking workflow for all qualified leads, returns job ID */
  async startRankingWorkflow(): Promise<{ jobId: string }> {
    logger.info("Ranking Service", "Executing ranking workflow for all qualified leads");

    const { jobId, result } = await executeRankingWorkflow({ leadIds: undefined });

    logger.info("Ranking Service", "Ranking workflow executed", {
      jobId,
      syncMode: !!result,
    });

    if (result) {
      logger.info("Ranking Service", "Sync ranking complete", {
        rankedCount: result.rankedCount,
        totalQualifiedLeads: result.totalQualifiedLeads,
      });
    }

    return { jobId };
  }

  /** Gets status of a ranking job by ID */
  async getJobStatus(jobId: string): Promise<JobStatusOutput> {
    // Handle synthetic job IDs from sync mode
    if (jobId.startsWith("sync-")) {
      logger.info("Ranking Service", "Returning mock completed status for sync job", {
        jobId,
      });

      return {
        id: jobId,
        status: TriggerRunStatus.COMPLETED,
        isCompleted: true,
        isFailed: false,
        output: undefined,
      };
    }

    // Real Trigger.dev job - fetch from API
    const run = await runs.retrieve(jobId);

    return {
      id: run.id,
      status: run.status as TriggerRunStatus,
      isCompleted: isCompletedStatus(run.status),
      isFailed: isFailedStatus(run.status),
      output: run.output || undefined,
    };
  }

  /** Ranks qualified leads, optionally filtered by IDs */
  async rankQualifiedLeads(leadIds?: string[]): Promise<RankingResult> {
    if (leadIds?.length === 0) {
      return { sessionId: randomUUID(), rankedCount: 0, totalQualifiedLeads: 0, results: [] };
    }

    const sessionId = randomUUID();
    const rankedAt = new Date();

    logger.info("Ranking Service", leadIds ? "Ranking specific qualified leads" : "Ranking all qualified leads", {
      sessionId,
      ...(leadIds && { leadCount: leadIds.length }),
    });

    const promptTemplate = await this.getActivePromptTemplate();
    const leadsData = await this.fetchQualifiedLeadsWithCompanies(leadIds);
    const groupedLeads = this.groupLeadsByCompany(leadsData);

    const totalQualified = leadsData.length;
    logger.info("Ranking Service", "Fetched qualified leads", {
      companyCount: groupedLeads.size,
      totalQualified,
    });

    if (totalQualified === 0) {
      logger.warn("Ranking Service", "No qualified leads found to rank");
      return { sessionId, rankedCount: 0, totalQualifiedLeads: 0, results: [] };
    }

    const result = await this.rankQualifiedLeadsGrouped({
      grouped: groupedLeads,
      sessionId,
      rankedAt,
      promptTemplate,
    });

    if (leadIds && result.rankedCount < totalQualified) {
      logger.warn("Ranking Service", "Some qualified leads were not ranked", {
        missingCount: totalQualified - result.rankedCount,
        expectedCount: totalQualified,
        rankedCount: result.rankedCount,
      });
    }

    return result;
  }

  /** Executes full ranking workflow with qualification and ranking phases */
  async rankLeadsWorkflow(payload: {
    leadIds?: string[];
    jobId?: string;
  }): Promise<{
    success: boolean;
    sessionId: string;
    rankedCount: number;
    totalQualifiedLeads: number;
  }> {
    const leadCount = payload.leadIds?.length || "ALL";
    logger.info("Rank Leads Workflow", "Starting ranking workflow", {
      leadCount,
      isSpecific: !!payload.leadIds,
    });

    try {
      await this.runQualificationPhase(payload.leadIds);
      const result = await this.runRankingPhase(payload.leadIds);

      return {
        success: true,
        sessionId: result.sessionId,
        rankedCount: result.rankedCount,
        totalQualifiedLeads: result.totalQualifiedLeads,
      };
    } catch (error) {
      logger.error("Rank Leads Workflow", error);
      throw error;
    }
  }

  /** Runs qualification phase and returns qualified/disqualified counts */
  private async runQualificationPhase(leadIds?: string[]): Promise<{
    qualifiedCount: number;
    disqualifiedCount: number;
  }> {
    logger.info("Rank Leads Workflow", "Phase 1: Running qualification");

    const qualificationResults = leadIds && leadIds.length > 0
      ? await qualificationService.qualifySpecificLeads(leadIds)
      : await qualificationService.qualifyAllLeads();

    const qualifiedCount = qualificationResults.reduce(
      (sum, result) => sum + result.qualifiedCount,
      0
    );
    const disqualifiedCount = qualificationResults.reduce(
      (sum, result) => sum + result.disqualifiedCount,
      0
    );

    logger.info("Rank Leads Workflow", "Phase 1 complete: Qualification", {
      totalQualified: qualifiedCount,
      totalDisqualified: disqualifiedCount,
    });

    return { qualifiedCount, disqualifiedCount };
  }

  /** Runs ranking phase for qualified leads */
  private async runRankingPhase(leadIds?: string[]): Promise<RankingResult> {
    logger.info("Rank Leads Workflow", "Phase 2: Running ranking");

    const result = await this.rankQualifiedLeads(leadIds);

    logger.info("Rank Leads Workflow", "Phase 2 complete: Ranking", {
      rankedCount: result.rankedCount,
      totalQualifiedLeads: result.totalQualifiedLeads,
    });

    return result;
  }

  /** Fetches qualified leads with company data, optionally filtered by IDs */
  private async fetchQualifiedLeadsWithCompanies(leadIds?: string[]): Promise<LeadWithCompany[]> {
    const baseQuery = db
      .select({
        leadId: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        jobTitle: leads.jobTitle,
        companyId: companies.id,
        companyName: companies.name,
        companyDomain: companies.domain,
        employeeRange: companies.employeeRange,
        industry: companies.industry,
      })
      .from(leads)
      .innerJoin(companies, eq(leads.companyId, companies.id));

    if (leadIds && leadIds.length > 0) {
      return await baseQuery.where(and(eq(leads.qualified, true), inArray(leads.id, leadIds)));
    } else {
      return await baseQuery.where(eq(leads.qualified, true));
    }
  }

  /** Groups leads by company ID for batch ranking */
  private groupLeadsByCompany(leadsData: LeadWithCompany[]): Map<string, LeadRankingInput[]> {
    const grouped = new Map<string, LeadRankingInput[]>();

    for (const lead of leadsData) {
      if (!grouped.has(lead.companyId)) {
        grouped.set(lead.companyId, []);
      }
      grouped.get(lead.companyId)!.push({
        id: lead.leadId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        jobTitle: lead.jobTitle,
        companyName: lead.companyName,
        companyDomain: lead.companyDomain,
        employeeRange: lead.employeeRange || "",
        industry: lead.industry,
      });
    }

    return grouped;
  }

  /** Retrieves the active prompt template for ranking */
  private async getActivePromptTemplate(): Promise<string> {
    const [activePrompt] = await db
      .select({ promptText: promptVersions.promptText })
      .from(promptVersions)
      .where(eq(promptVersions.isActive, true))
      .limit(1);

    if (!activePrompt) {
      throw new Error("No active prompt template found. Please create a baseline prompt first.");
    }

    return activePrompt.promptText;
  }

  /** Ranks leads grouped by company with parallel processing */
  private async rankQualifiedLeadsGrouped({
    grouped,
    sessionId,
    rankedAt,
    promptTemplate,
  }: RankQualifiedLeadsParams): Promise<RankingResult> {
    logger.info("Ranking Service", "Ranking companies in parallel", {
      totalCompanies: grouped.size,
      concurrency: RANKING_CONFIG.CONCURRENCY,
    });

    const companyResults = await parallel(
      RANKING_CONFIG.CONCURRENCY,
      Array.from(grouped.entries()),
      async ([, companyLeads]) => {
        return this.rankSingleCompany(companyLeads, rankedAt, sessionId, promptTemplate);
      }
    );

    const allResults = companyResults.flat();
    allResults.sort((a, b) => a.companyRank - b.companyRank);

    logger.info("Ranking Service", "Ranking complete", {
      totalCompanies: grouped.size,
      rankedCount: allResults.length,
      sessionId,
    });

    return {
      sessionId,
      rankedCount: allResults.length,
      totalQualifiedLeads: allResults.length,
      results: allResults,
    };
  }

  /** Ranks all leads within a single company */
  private async rankSingleCompany(
    companyLeads: LeadRankingInput[],
    rankedAt: Date,
    sessionId: string,
    promptTemplate: string
  ): Promise<RankingResult["results"]> {
    const companyName = companyLeads[0]?.companyName || "Unknown";

    logger.info("Ranking Service", "Ranking qualified leads for company", {
      companyName,
      qualifiedCount: companyLeads.length,
    });

    const rawRankings = await rankingAgent.rankQualifiedLeads({ leads: companyLeads, promptTemplate });
    const rankings = rankingOutputArraySchema.parse(rawRankings);

    if (rankings.length > 0) {
      await this.updateLeadsWithRankings(rankings, rankedAt, sessionId);
    }

    const results = this.buildCompanyRankingResults(rankings, companyLeads, companyName);

    logger.info("Ranking Service", "Company ranking complete", {
      companyName,
      rankedCount: results.length,
    });

    return results;
  }

  /** Batch updates leads with ranking results */
  private async updateLeadsWithRankings(
    rankings: { leadId: string; rank: number; reasoning: string }[],
    rankedAt: Date,
    sessionId: string
  ): Promise<void> {
    const values = sql.join(
      rankings.map((r) =>
        sql`(${r.leadId}::uuid, ${r.rank}::numeric, ${r.reasoning}, ${rankedAt.toISOString()}::timestamp, ${sessionId}::uuid)`
      ),
      sql`, `
    );

    await db.execute(sql`
      UPDATE ${leads}
      SET
        company_rank = data.rank,
        ranking_reasoning = data.reasoning,
        ranked_at = data.ranked_at,
        ranking_session_id = data.ranking_session_id
      FROM (VALUES ${values}) AS data(id, rank, reasoning, ranked_at, ranking_session_id)
      WHERE ${leads.id} = data.id::uuid
    `);
  }

  /** Builds ranking result objects from AI rankings and lead data */
  private buildCompanyRankingResults(
    rankings: { leadId: string; rank: number; reasoning: string }[],
    companyLeads: LeadRankingInput[],
    companyName: string
  ): RankingResult["results"] {
    const companyLeadsMap = new Map(companyLeads.map(l => [l.id, l]));
    const results: RankingResult["results"] = [];
    let invalidRankingCount = 0;

    for (const ranking of rankings) {
      const lead = companyLeadsMap.get(ranking.leadId);

      if (!lead) {
        invalidRankingCount++;
        continue;
      }

      results.push({
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        jobTitle: lead.jobTitle,
        companyName: lead.companyName,
        employeeRange: lead.employeeRange,
        companyRank: ranking.rank,
        reasoning: ranking.reasoning,
      });
    }

    if (invalidRankingCount > 0) {
      logger.warn("Ranking Service", "Rankings referenced non-existent leads", {
        companyName,
        invalidCount: invalidRankingCount,
        expectedCount: companyLeads.length,
        receivedCount: rankings.length,
      });
    }

    return results;
  }
}

export const rankingService = RankingService.getInstance();
