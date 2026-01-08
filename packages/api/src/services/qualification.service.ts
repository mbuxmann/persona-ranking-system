import { db } from "@leads/db";
import { companies, leads } from "@leads/db/schema/index";
import { eq, inArray, sql } from "@leads/db/drizzle";
import { randomUUID } from "crypto";
import { parallel } from "radash";
import { qualificationAgent } from "../agents/qualification.agent";
import { PERSONA_SPEC } from "../config/persona-spec";
import { QUALIFICATION_CONFIG } from "../config/constants";
import { logger } from "../utils/logger";
import { utils } from "../utils";
import type { LeadQualificationInput, LeadQualificationOutput, QualificationResult } from "../schemas/qualification";
import { qualificationOutputArraySchema } from "../schemas/agent-outputs";

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

/**
 * Qualification Service
 * Handles lead qualification against persona spec using AI
 */
export class QualificationService {
  private static instance: QualificationService;

  private constructor() {}

  static getInstance(): QualificationService {
    if (!QualificationService.instance) {
      QualificationService.instance = new QualificationService();
    }
    return QualificationService.instance;
  }

  /** Qualifies all leads in the database */
  async qualifyAllLeads(): Promise<QualificationResult[]> {
    return this.qualifyLeads();
  }

  /** Qualifies specific leads by their IDs */
  async qualifySpecificLeads(leadIds: string[]): Promise<QualificationResult[]> {
    if (leadIds.length === 0) return [];
    return this.qualifyLeads(leadIds);
  }

  /** Core qualification logic - processes leads in batches through AI */
  private async qualifyLeads(leadIds?: string[]): Promise<QualificationResult[]> {
    const sessionId = randomUUID();
    const isSpecific = leadIds !== undefined;

    logger.info("Qualification Service", isSpecific ? "Qualifying specific leads" : "Starting qualification process", {
      sessionId,
      ...(isSpecific && { leadCount: leadIds.length }),
    });

    const leadsData = await this.fetchLeadsWithCompanies(leadIds);
    const allLeads = this.mapLeadsToQualificationInput(leadsData);
    const batches = utils.chunk(allLeads, QUALIFICATION_CONFIG.BATCH_SIZE);

    logger.info("Qualification Service", "Processing leads in batches", {
      totalLeads: allLeads.length,
      batchCount: batches.length,
      batchSize: QUALIFICATION_CONFIG.BATCH_SIZE,
    });

    const batchResults = await parallel(
      QUALIFICATION_CONFIG.CONCURRENCY,
      batches.map((batch, i) => ({ batch, index: i })),
      async ({ batch, index }) => this.processSingleBatch(batch, index + 1, batches.length)
    );

    const allQualifications: LeadQualificationOutput[] = batchResults.flat();

    const results = this.aggregateQualificationResults(allQualifications, allLeads, sessionId);

    logger.info("Qualification Service", "Qualification complete", {
      totalLeads: allLeads.length,
      totalCompanies: results.length,
      totalQualified: allQualifications.filter(q => q.qualified).length,
      sessionId,
    });

    return results;
  }

  /** Processes a single batch through AI and persists results */
  private async processSingleBatch(
    batch: LeadQualificationInput[],
    batchNumber: number,
    totalBatches: number
  ): Promise<LeadQualificationOutput[]> {
    logger.info("Qualification Service", "Qualifying batch", {
      batchNumber,
      totalBatches,
      batchSize: batch.length,
    });

    const rawQualifications = await qualificationAgent.qualifyLeads({ leads: batch, personaSpec: PERSONA_SPEC });
    const qualifications = qualificationOutputArraySchema.parse(rawQualifications);

    if (qualifications.length > 0) {
      await this.updateLeadsWithQualifications(qualifications);
    }

    const qualifiedCount = qualifications.filter(q => q.qualified).length;
    logger.info("Qualification Service", "Batch qualification complete", {
      batchNumber,
      qualifiedCount,
      disqualifiedCount: qualifications.length - qualifiedCount,
    });

    return qualifications;
  }

  /** Batch updates leads with qualification results and clears rankings for disqualified */
  private async updateLeadsWithQualifications(qualifications: LeadQualificationOutput[]): Promise<void> {
    const values = sql.join(
      qualifications.map((q) =>
        sql`(${q.leadId}::uuid, ${q.qualified}::boolean, ${q.reasoning})`
      ),
      sql`, `
    );

    await db.execute(sql`
      UPDATE ${leads}
      SET
        qualified = data.qualified,
        qualification_reasoning = data.reasoning,
        company_rank = CASE WHEN data.qualified = false THEN NULL ELSE ${leads.companyRank} END,
        ranking_reasoning = CASE WHEN data.qualified = false THEN NULL ELSE ${leads.rankingReasoning} END,
        ranked_at = CASE WHEN data.qualified = false THEN NULL ELSE ${leads.rankedAt} END,
        ranking_session_id = CASE WHEN data.qualified = false THEN NULL ELSE ${leads.rankingSessionId} END
      FROM (VALUES ${values}) AS data(id, qualified, reasoning)
      WHERE ${leads.id} = data.id::uuid
    `);
  }

  /** Groups qualification results by company for the response */
  private aggregateQualificationResults(
    allQualifications: LeadQualificationOutput[],
    allLeads: LeadQualificationInput[],
    sessionId: string
  ): QualificationResult[] {
    const leadsMap = new Map(allLeads.map(l => [l.id, l]));

    const companiesMap = new Map<string, {
      companyName: string;
      qualifications: LeadQualificationOutput[];
    }>();

    for (const qual of allQualifications) {
      const lead = leadsMap.get(qual.leadId);
      if (!lead) continue;

      if (!companiesMap.has(lead.companyName)) {
        companiesMap.set(lead.companyName, {
          companyName: lead.companyName,
          qualifications: [],
        });
      }
      companiesMap.get(lead.companyName)!.qualifications.push(qual);
    }

    return Array.from(companiesMap.values()).map(({ companyName, qualifications: companyQuals }) => {
      const qualifiedCount = companyQuals.filter(q => q.qualified).length;
      return {
        sessionId,
        companyName,
        totalLeads: companyQuals.length,
        qualifiedCount,
        disqualifiedCount: companyQuals.length - qualifiedCount,
        qualifications: companyQuals.map(q => {
          const lead = leadsMap.get(q.leadId)!;
          return {
            leadId: q.leadId,
            firstName: lead.firstName,
            lastName: lead.lastName,
            jobTitle: lead.jobTitle,
            qualified: q.qualified,
            reasoning: q.reasoning,
          };
        }),
      };
    });
  }

  /** Fetches leads with company data, optionally filtered by IDs */
  private async fetchLeadsWithCompanies(leadIds?: string[]): Promise<LeadWithCompany[]> {
    let query = db
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
      query = query.where(inArray(leads.id, leadIds)) as typeof query;
    }

    return await query;
  }

  /** Maps database rows to qualification input format */
  private mapLeadsToQualificationInput(leadsData: LeadWithCompany[]): LeadQualificationInput[] {
    return leadsData.map(lead => ({
      id: lead.leadId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      jobTitle: lead.jobTitle,
      companyName: lead.companyName,
      companyDomain: lead.companyDomain || "",
      employeeRange: lead.employeeRange || "",
      industry: lead.industry,
    }));
  }
}

export const qualificationService = QualificationService.getInstance();
