import { db } from "@leads/db";
import { companies, leads, uploads } from "@leads/db/schema/index";
import { sql, eq } from "@leads/db/drizzle";
import type { CSVRow } from "../schemas/csv";
import { logger } from "../utils/logger";
import { utils } from "../utils";
import { IMPORT_CONFIG } from "../config/constants";
import { executeRankingWorkflow } from "../utils/task-executor";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface ImportFromCSVParams {
  rows: CSVRow[];
  uploadId: string;
}

interface ImportWithinTransactionParams extends ImportFromCSVParams {
  tx: DbTransaction;
}

interface ImportInChunksParams extends ImportFromCSVParams {
  chunkSize?: number;
  onProgress?: (current: number, total: number) => void;
}

interface ImportCsvWorkflowParams {
  csvData: CSVRow[];
  filename: string;
  uploadId: string;
  jobId: string;
}

interface CompanyData {
  name: string;
  domain: string;
  employeeRange: string;
  industry: string;
}

interface ImportResult {
  companyIds: string[];
  leadIds: string[];
  companiesAdded: number;
  companiesUpdated: number;
  leadsAdded: number;
  leadsSkipped: number;
}

export interface ImportCsvWorkflowResult {
  success: boolean;
  companiesAdded: number;
  companiesUpdated: number;
  leadsAdded: number;
  leadsSkipped: number;
  totalRows: number;
  qualifiedCount: number;
  rankedCount: number;
  rankingJobId: null;
}

/**
 * Import Service
 * Handles CSV data import with company upsert and lead insertion
 */
export class ImportService {
  private static instance: ImportService;

  private constructor() { }

  static getInstance(): ImportService {
    if (!ImportService.instance) {
      ImportService.instance = new ImportService();
    }
    return ImportService.instance;
  }

  /** Imports CSV rows within a database transaction */
  async importFromCSV({
    rows,
    uploadId,
  }: ImportFromCSVParams): Promise<ImportResult> {
    logger.info("Import Service", "Starting import transaction", {
      rowCount: rows.length,
      uploadId,
    });

    return await db.transaction(async (tx) => {
      return await this.importWithinTransaction({ rows, uploadId, tx });
    });
  }

  /** Imports large CSV files in chunks with progress tracking */
  async importFromCSVInChunks({
    rows,
    uploadId,
    chunkSize = 100,
    onProgress,
  }: ImportInChunksParams): Promise<ImportResult> {
    const chunks = utils.chunk(rows, chunkSize);
    logger.info("Import Service", "Starting chunked import", {
      totalRows: rows.length,
      chunkCount: chunks.length,
      chunkSize,
    });

    const allCompanyIds: string[] = [];
    const allLeadIds: string[] = [];
    let totalCompaniesAdded = 0;
    let totalCompaniesUpdated = 0;
    let totalLeadsAdded = 0;
    let totalLeadsSkipped = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkData = chunks[i]!;
      logger.info("Import Service", "Processing chunk", {
        chunkNumber: i + 1,
        totalChunks: chunks.length,
        chunkSize: chunkData.length,
      });

      const chunkResult = await this.importFromCSV({ rows: chunkData, uploadId });

      allCompanyIds.push(...chunkResult.companyIds);
      allLeadIds.push(...chunkResult.leadIds);
      totalCompaniesAdded += chunkResult.companiesAdded;
      totalCompaniesUpdated += chunkResult.companiesUpdated;
      totalLeadsAdded += chunkResult.leadsAdded;
      totalLeadsSkipped += chunkResult.leadsSkipped;

      if (onProgress) {
        onProgress(i + 1, chunks.length);
      }
    }

    logger.info("Import Service", "Chunked import complete", {
      totalLeadsAdded,
      totalLeadsSkipped,
      totalCompaniesAdded,
      totalCompaniesUpdated,
    });

    return {
      companyIds: [...new Set(allCompanyIds)],
      leadIds: allLeadIds,
      companiesAdded: totalCompaniesAdded,
      companiesUpdated: totalCompaniesUpdated,
      leadsAdded: totalLeadsAdded,
      leadsSkipped: totalLeadsSkipped,
    };
  }

  /** Orchestrates full import workflow: import, qualify, and rank */
  async importCsvWorkflow({
    csvData,
    filename,
    uploadId,
    jobId,
  }: ImportCsvWorkflowParams): Promise<ImportCsvWorkflowResult> {
    logger.info("Import Workflow", `Starting import workflow for ${csvData.length} rows`, {
      filename,
      rowCount: csvData.length,
      uploadId,
    });

    await this.initializeUpload(uploadId, jobId, filename, csvData.length);

    try {
      const importResult = await this.executeImport(csvData, uploadId, IMPORT_CONFIG);

      logger.info("Import Workflow", "Import complete", {
        companiesAdded: importResult.companiesAdded,
        leadsAdded: importResult.leadsAdded,
        leadsSkipped: importResult.leadsSkipped,
        leadIdsCount: importResult.leadIds.length,
      });

      const { qualifiedCount, rankedCount } = await this.runWorkflowPhases(importResult.leadIds);

      await this.updateUploadStatus(uploadId, "completed", {
        companiesAdded: importResult.companiesAdded,
        companiesUpdated: importResult.companiesUpdated,
        leadsAdded: importResult.leadsAdded,
        leadsSkipped: importResult.leadsSkipped,
      });

      return {
        success: true,
        companiesAdded: importResult.companiesAdded,
        companiesUpdated: importResult.companiesUpdated,
        leadsAdded: importResult.leadsAdded,
        leadsSkipped: importResult.leadsSkipped,
        totalRows: csvData.length,
        qualifiedCount,
        rankedCount,
        rankingJobId: null,
      };
    } catch (error) {
      logger.error("CSV import workflow", error, {
        filename,
        totalRows: csvData.length,
        uploadId,
      });

      await this.updateUploadStatus(uploadId, "failed", {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  }

  /** Runs qualification and ranking phases for imported leads */
  private async runWorkflowPhases(leadIds: string[]): Promise<{
    qualifiedCount: number;
    rankedCount: number;
  }> {
    if (leadIds.length === 0) {
      logger.info("Import Workflow", "No new leads to process (all duplicates)");
      return { qualifiedCount: 0, rankedCount: 0 };
    }

    const qualifiedCount = await this.executeQualificationPhase(leadIds);

    if (qualifiedCount === 0) {
      logger.info("Import Workflow", "No qualified leads to rank");
      return { qualifiedCount: 0, rankedCount: 0 };
    }

    const rankedCount = await this.executeRankingPhase(leadIds);
    return { qualifiedCount, rankedCount };
  }

  /** Executes import with chunking for large files */
  private async executeImport(
    csvData: CSVRow[],
    uploadId: string,
    config: { CHUNK_THRESHOLD: number; CHUNK_SIZE: number }
  ): Promise<ImportResult> {
    if (csvData.length >= config.CHUNK_THRESHOLD) {
      logger.info("Import Workflow", `Large file detected, using chunked processing`, {
        rowCount: csvData.length,
        chunkSize: config.CHUNK_SIZE,
      });
      return this.importFromCSVInChunks({
        rows: csvData,
        uploadId,
        chunkSize: config.CHUNK_SIZE,
        onProgress: (current, total) => {
          logger.info("Import Workflow", `Processing chunks: ${current}/${total}`, {
            current,
            total,
          });
        },
      });
    }

    logger.info("Import Workflow", `Importing rows to database`, {
      rowCount: csvData.length,
    });
    return this.importFromCSV({ rows: csvData, uploadId });
  }

  /** Executes qualification phase and returns count of qualified leads */
  private async executeQualificationPhase(leadIds: string[]): Promise<number> {
    logger.info("Import Workflow", "Starting Phase 1: Qualification", {
      leadCount: leadIds.length,
      leadIds: leadIds.slice(0, 3),
    });

    const { qualificationService } = await import("./qualification.service");

    try {
      const qualificationResults = await qualificationService.qualifySpecificLeads(leadIds);

      logger.info("Import Workflow", "Qualification service returned results", {
        resultCount: qualificationResults.length,
        results: qualificationResults.map((r) => ({
          companyName: r.companyName,
          qualified: r.qualifiedCount,
          disqualified: r.disqualifiedCount,
        })),
      });

      const qualifiedCount = qualificationResults.reduce(
        (sum, result) => sum + result.qualifiedCount,
        0
      );

      logger.info("Import Workflow", "Phase 1 complete", {
        totalLeads: leadIds.length,
        qualifiedCount,
        disqualifiedCount: leadIds.length - qualifiedCount,
      });

      return qualifiedCount;
    } catch (error) {
      logger.error("Import Workflow", "Qualification failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /** Executes ranking phase and returns count of ranked leads */
  private async executeRankingPhase(leadIds: string[]): Promise<number> {
    logger.info("Import Workflow", "Starting Phase 2: Ranking", {
      leadCount: leadIds.length,
    });

    const { result: rankingResult } = await executeRankingWorkflow({ leadIds });

    const rankedCount = rankingResult?.rankedCount || 0;

    logger.info("Import Workflow", "Phase 2 complete", {
      rankedCount,
      asyncRanking: !rankingResult,
    });

    return rankedCount;
  }

  /** Creates initial upload record in processing state */
  private async initializeUpload(
    uploadId: string,
    jobId: string,
    filename: string,
    totalRows: number
  ): Promise<void> {
    await db.insert(uploads).values({
      id: uploadId,
      jobId,
      filename,
      status: "processing",
      totalRows,
    });
  }

  /** Updates upload record with final status and results */
  private async updateUploadStatus(
    uploadId: string,
    status: "completed" | "failed",
    data: {
      companiesAdded?: number;
      companiesUpdated?: number;
      leadsAdded?: number;
      leadsSkipped?: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    if (status === "completed") {
      await db
        .update(uploads)
        .set({
          status: "completed",
          companiesAdded: data.companiesAdded,
          companiesUpdated: data.companiesUpdated,
          leadsAdded: data.leadsAdded,
          leadsSkipped: data.leadsSkipped,
          rankingJobId: null,
          completedAt: new Date(),
        })
        .where(eq(uploads.id, uploadId));
    } else {
      await db
        .update(uploads)
        .set({
          status: "failed",
          errorMessage: data.errorMessage,
          completedAt: new Date(),
        })
        .where(eq(uploads.id, uploadId));
    }
  }

  /** Performs import operations within an existing transaction */
  private async importWithinTransaction({
    rows,
    uploadId,
    tx,
  }: ImportWithinTransactionParams): Promise<ImportResult> {
    const uniqueCompanies = this.extractUniqueCompanies(rows);

    logger.info("Import Service", "Extracted unique companies", {
      uniqueCompanyCount: uniqueCompanies.size,
    });

    const { companyMap, companiesAdded, companiesUpdated } = await this.upsertCompanies(
      tx,
      uniqueCompanies
    );

    const { leadIds, leadsAdded, leadsSkipped } = await this.insertLeads(
      tx,
      rows,
      companyMap,
      uploadId
    );

    return {
      companyIds: Array.from(companyMap.values()),
      leadIds,
      companiesAdded,
      companiesUpdated,
      leadsAdded,
      leadsSkipped,
    };
  }

  /** Extracts unique companies from CSV rows keyed by domain */
  private extractUniqueCompanies(rows: CSVRow[]): Map<string, CompanyData> {
    const uniqueCompanies = new Map<string, CompanyData>();

    for (const row of rows) {
      if (row.account_domain && !uniqueCompanies.has(row.account_domain)) {
        uniqueCompanies.set(row.account_domain, {
          name: row.account_name,
          domain: row.account_domain,
          employeeRange: row.account_employee_range || "",
          industry: row.account_industry || "",
        });
      }
    }

    return uniqueCompanies;
  }

  /** Upserts all companies and returns domain-to-ID mapping */
  private async upsertCompanies(
    tx: DbTransaction,
    uniqueCompanies: Map<string, CompanyData>
  ): Promise<{
    companyMap: Map<string, string>;
    companiesAdded: number;
    companiesUpdated: number;
  }> {
    const companyMap = new Map<string, string>();
    let companiesAdded = 0;
    let companiesUpdated = 0;

    for (const [domain, company] of uniqueCompanies) {
      const result = await this.upsertSingleCompany(tx, domain, company);

      companyMap.set(result.domain, result.id);
      if (result.wasInserted) {
        companiesAdded++;
      } else {
        companiesUpdated++;
      }
    }

    logger.info("Import Service", "Companies upserted", {
      companiesAdded,
      companiesUpdated,
      totalCompanies: companiesAdded + companiesUpdated,
    });

    return { companyMap, companiesAdded, companiesUpdated };
  }

  /** Upserts a single company and returns its ID with insert flag */
  private async upsertSingleCompany(
    tx: DbTransaction,
    domain: string,
    company: CompanyData
  ): Promise<{ id: string; domain: string; wasInserted: boolean }> {
    try {
      const [inserted] = await tx
        .insert(companies)
        .values(company)
        .onConflictDoUpdate({
          target: companies.domain,
          set: {
            name: company.name,
            employeeRange: company.employeeRange,
            industry: company.industry,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: companies.id,
          domain: companies.domain,
          wasInserted: sql<boolean>`(xmax = 0)`,
        });

      if (!inserted) {
        throw new Error(`Failed to upsert company: ${domain}`);
      }

      return inserted;
    } catch (error) {
      logger.error("Company upsert", error, { domain });
      throw error;
    }
  }

  /** Inserts all leads with duplicate detection */
  private async insertLeads(
    tx: DbTransaction,
    rows: CSVRow[],
    companyMap: Map<string, string>,
    uploadId: string
  ): Promise<{
    leadIds: string[];
    leadsAdded: number;
    leadsSkipped: number;
  }> {
    const leadIds: string[] = [];
    let leadsAdded = 0;
    let leadsSkipped = 0;

    for (const row of rows) {
      const result = await this.insertSingleLead(tx, row, companyMap, uploadId);

      if (result.leadId) {
        leadIds.push(result.leadId);
        leadsAdded++;
      } else {
        leadsSkipped++;
      }
    }

    logger.info("Import Service", "Leads inserted", {
      leadsAdded,
      leadsSkipped,
      totalLeads: leadsAdded + leadsSkipped,
    });

    return { leadIds, leadsAdded, leadsSkipped };
  }

  /** Inserts a single lead or skips if duplicate */
  private async insertSingleLead(
    tx: DbTransaction,
    row: CSVRow,
    companyMap: Map<string, string>,
    uploadId: string
  ): Promise<{ leadId: string | null }> {
    const companyId = companyMap.get(row.account_domain);

    if (!companyId) {
      logger.warn("Import Service", "Skipping lead - company not found", {
        firstName: row.lead_first_name,
        lastName: row.lead_last_name,
        domain: row.account_domain,
      });
      return { leadId: null };
    }

    try {
      const insertedLeads = await tx
        .insert(leads)
        .values({
          companyId,
          uploadId,
          firstName: row.lead_first_name,
          lastName: row.lead_last_name,
          jobTitle: row.lead_job_title,
        })
        .onConflictDoNothing({
          target: [leads.firstName, leads.lastName, leads.companyId],
        })
        .returning({ id: leads.id });

      return { leadId: insertedLeads[0]?.id || null };
    } catch (error) {
      logger.error("Lead insertion", error, {
        firstName: row.lead_first_name,
        lastName: row.lead_last_name,
      });
      return { leadId: null };
    }
  }
}

export const importService = ImportService.getInstance();
