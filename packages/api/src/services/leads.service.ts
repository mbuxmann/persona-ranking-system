import { db } from "@leads/db";
import { leads, companies, uploads } from "@leads/db/schema/index";
import { eq, sql } from "@leads/db/drizzle";
import type { LeadWithRanking } from "../schemas/ranking";

/**
 * Leads Service
 * Handles lead listing and data retrieval operations
 */
export class LeadsService {
  private static instance: LeadsService;

  private constructor() {}

  static getInstance(): LeadsService {
    if (!LeadsService.instance) {
      LeadsService.instance = new LeadsService();
    }
    return LeadsService.instance;
  }

  /**
   * List all leads with company and ranking info
   * Optionally filter by upload ID
   */
  async listLeads(uploadId?: string): Promise<LeadWithRanking[]> {
    const allLeads = await this.buildLeadsQuery(uploadId);
    return this.mapLeadsToResponse(allLeads);
  }

  /** Builds the leads query with joins and optional upload filter */
  private async buildLeadsQuery(uploadId?: string) {
    const baseQuery = db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        jobTitle: leads.jobTitle,
        companyName: companies.name,
        employeeRange: companies.employeeRange,
        industry: companies.industry,
        qualified: leads.qualified,
        companyRank: leads.companyRank,
        qualificationReasoning: leads.qualificationReasoning,
        rankingReasoning: leads.rankingReasoning,
        rankedAt: leads.rankedAt,
        uploadId: leads.uploadId,
        uploadFilename: uploads.filename,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .innerJoin(companies, eq(leads.companyId, companies.id))
      .leftJoin(uploads, eq(leads.uploadId, uploads.id))
      .$dynamic();

    const filtered = uploadId
      ? baseQuery.where(eq(leads.uploadId, uploadId))
      : baseQuery;

    return filtered.orderBy(sql`${leads.companyRank} ASC NULLS LAST`);
  }

  /** Maps database rows to API response format */
  private mapLeadsToResponse(
    allLeads: Awaited<ReturnType<typeof this.buildLeadsQuery>>
  ): LeadWithRanking[] {
    return allLeads.map((lead) => ({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      jobTitle: lead.jobTitle,
      companyName: lead.companyName,
      employeeRange: lead.employeeRange,
      industry: lead.industry,
      qualified: lead.qualified,
      companyRank: lead.companyRank !== null ? Number(lead.companyRank) : null,
      qualificationReasoning: lead.qualificationReasoning,
      rankingReasoning: lead.rankingReasoning,
      rankedAt: lead.rankedAt ? lead.rankedAt.toISOString() : null,
      uploadId: lead.uploadId,
      uploadFilename: lead.uploadFilename,
      createdAt: lead.createdAt.toISOString(),
    }));
  }
}

export const leadsService = LeadsService.getInstance();
