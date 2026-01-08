import csv from "csv-parser";
import { Readable } from "stream";
import { csvRowSchema, type CSVRow, rankedLeadRowSchema, type ValidationError } from "../schemas/csv";
import { ZodError } from "zod";
import { db } from "@leads/db";
import { uploads } from "@leads/db/schema/index";
import { sql, desc } from "@leads/db/drizzle";
import { stringify } from "csv-stringify/sync";
import { runs } from "@trigger.dev/sdk";
import { ExportError, ExportErrorCode, ImportError, ImportErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";
import { executeImportWorkflow } from "../utils/task-executor";
import { isFailedStatus, isCompletedStatus, TriggerRunStatus } from "../utils/trigger";
import { API_CONFIG, TASK_IDS } from "../config/constants";
import type { ImportJobStatus } from "../schemas/import";
import type { UploadHistory } from "../schemas/csv";

/**
 * CSV Service
 * Handles CSV parsing, validation, import, and export operations
 */
export class CSVService {
  private static instance: CSVService;

  private constructor() {}

  static getInstance(): CSVService {
    if (!CSVService.instance) {
      CSVService.instance = new CSVService();
    }
    return CSVService.instance;
  }

  /** Parses and validates a CSV file, returns validated rows or errors */
  async parseCSV(
    file: File
  ): Promise<{
    valid: boolean;
    data?: CSVRow[];
    errors?: string[];
    validationErrors?: ValidationError[];
    totalRows?: number;
    validRows?: number;
  }> {
    try {
      logger.info("CSV Service", "Parsing CSV file", {
        filename: file.name,
        fileSize: file.size,
      });

      const rows = await this.parseRawCSV(file);

      logger.info("CSV Service", "CSV parsed", {
        rowCount: rows.length,
      });

      const { validatedRows, errors, validationErrors } = this.validateRows(rows);

      if (errors.length > 0) {
        logger.warn("CSV Service", "Validation errors found", {
          errorCount: errors.length,
          totalRows: rows.length,
          validRows: validatedRows.length,
        });
        return {
          valid: false,
          errors,
          validationErrors,
          totalRows: rows.length,
          validRows: validatedRows.length,
        };
      }

      logger.info("CSV Service", "Validation successful", {
        validatedRows: validatedRows.length,
      });
      return {
        valid: true,
        data: validatedRows,
        totalRows: rows.length,
        validRows: validatedRows.length,
      };
    } catch (error) {
      logger.error("CSV parsing", error, {
        filename: file.name,
        fileSize: file.size,
      });
      return {
        valid: false,
        errors: [
          error instanceof Error
            ? error.message
            : "Unknown error during CSV parsing",
        ],
      };
    }
  }

  /** Streams and parses raw CSV content into records */
  private async parseRawCSV(file: File): Promise<Record<string, string>[]> {
    const csvContent = await file.text();
    const buffer = Buffer.from(csvContent, "utf-8");
    const stream = Readable.from(buffer);

    return new Promise<Record<string, string>[]>((resolve, reject) => {
      const results: Record<string, string>[] = [];

      stream
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => resolve(results))
        .on("error", reject);
    });
  }

  /** Validates rows against schema, collecting valid rows and errors */
  private validateRows(rows: Record<string, string>[]): {
    validatedRows: CSVRow[];
    errors: string[];
    validationErrors: ValidationError[];
  } {
    const validatedRows: CSVRow[] = [];
    const errors: string[] = [];
    const validationErrors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const validatedRow = csvRowSchema.parse(rows[i]);
        validatedRows.push(validatedRow);
      } catch (error) {
        if (error instanceof ZodError) {
          const rowNum = i + 2;
          const rawRow = rows[i]!;

          for (const issue of error.issues) {
            const field = issue.path.join(".");
            validationErrors.push({
              rowNumber: rowNum,
              field,
              message: issue.message,
              value: rawRow[field],
            });
          }

          const fieldErrors = error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ");
          errors.push(`Row ${rowNum}: ${fieldErrors}`);
        }
      }
    }

    return { validatedRows, errors, validationErrors };
  }

  /** Generates CSV export of top N ranked leads per company */
  async generateCSV(topN: number): Promise<string> {
    if (!Number.isInteger(topN) || topN < 1 || topN > 100 || !Number.isFinite(topN)) {
      throw new ExportError(
        `topN must be a finite integer between 1 and 100, received: ${topN}`,
        ExportErrorCode.INVALID_PARAMETER,
        { topN, type: typeof topN }
      );
    }

    logger.info("CSV Service", "Starting CSV export", { topN });

    const rankedLeads = await db.execute(sql`
      WITH ranked_leads AS (
        SELECT
          c.name as company_name,
          l.first_name,
          l.last_name,
          l.job_title,
          c.employee_range,
          l.company_rank as rank_score,
          l.ranking_reasoning as reasoning,
          ROW_NUMBER() OVER (
            PARTITION BY l.company_id
            ORDER BY l.company_rank DESC NULLS LAST
          ) as rank_within_company
        FROM leads l
        INNER JOIN companies c ON l.company_id = c.id
        WHERE l.company_rank IS NOT NULL
      )
      SELECT
        company_name,
        first_name,
        last_name,
        job_title,
        employee_range,
        rank_score,
        reasoning
      FROM ranked_leads
      WHERE rank_within_company <= ${topN}
      ORDER BY company_name, rank_score DESC
    `);

    const rows = rankedLeads.rows.map((row) => rankedLeadRowSchema.parse(row));
    const records = this.transformRankedLeadsToRecords(rows);

    const csvString = stringify(records, {
      header: true,
      escape_formulas: true,
      columns: this.buildExportCSVColumns(),
    });

    const uniqueCompanies = new Set(rows.map((r) => r.company_name)).size;
    logger.info("CSV Service", "CSV export complete", {
      leadCount: records.length,
      companyCount: uniqueCompanies,
    });

    return csvString;
  }

  /** Transforms database rows into export-friendly records */
  private transformRankedLeadsToRecords(
    rows: Array<{
      company_name: string;
      first_name: string;
      last_name: string;
      job_title: string;
      employee_range: string | null;
      rank_score: string | null;
      reasoning: string | null;
    }>
  ): Record<string, string | number>[] {
    return rows.map((row) => ({
      "Company": row.company_name,
      "First Name": row.first_name,
      "Last Name": row.last_name,
      "Job Title": row.job_title,
      "Employee Range": row.employee_range || "",
      "Rank Score": row.rank_score || "",
      "Reasoning": row.reasoning || "",
    }));
  }

  /** Returns column headers for CSV export */
  private buildExportCSVColumns(): string[] {
    return [
      "Company",
      "First Name",
      "Last Name",
      "Job Title",
      "Employee Range",
      "Rank Score",
      "Reasoning",
    ];
  }

  /**
   * Upload and import CSV file
   * Parses, validates, and triggers background import job
   */
  async uploadAndImport(file: File): Promise<{
    importJobId?: string;
    errors: string[];
    validationErrors?: ValidationError[];
    totalRows?: number;
    validRows?: number;
  }> {
    logger.info("CSV Service", "Validating CSV upload", {
      filename: file.name,
      fileSize: file.size,
    });

    const parseResult = await this.parseCSV(file);

    if (!parseResult.valid || !parseResult.data) {
      logger.warn("CSV Service", "CSV validation failed", {
        filename: file.name,
        errorCount: parseResult.errors?.length || 0,
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows,
      });
      return {
        errors: parseResult.errors || ["Failed to parse CSV"],
        validationErrors: parseResult.validationErrors,
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows,
      };
    }

    logger.info("CSV Service", "CSV validated successfully", {
      rowCount: parseResult.data.length,
    });

    return this.executeImportWithErrorHandling(parseResult.data, file.name);
  }

  /** Executes import workflow with error handling */
  private async executeImportWithErrorHandling(
    csvData: CSVRow[],
    filename: string
  ): Promise<{
    importJobId?: string;
    errors: string[];
  }> {
    try {
      const uploadId = crypto.randomUUID();

      const { jobId, result } = await executeImportWorkflow({
        csvData,
        filename,
        uploadId,
      });

      logger.info("CSV Service", "Import workflow executed", {
        jobId,
        uploadId,
        rowCount: csvData.length,
        syncMode: !!result,
      });

      if (result) {
        logger.info("CSV Service", "Sync import complete", {
          companiesAdded: result.companiesAdded,
          leadsAdded: result.leadsAdded,
          qualifiedCount: result.qualifiedCount,
          rankedCount: result.rankedCount,
        });
      }

      return {
        importJobId: jobId,
        errors: [],
      };
    } catch (error) {
      return this.handleImportError(error, filename, csvData.length);
    }
  }

  /** Wraps import errors with proper logging and formatting */
  private handleImportError(
    error: unknown,
    filename: string,
    rowCount: number
  ): {
    importJobId?: string;
    errors: string[];
  } {
    const importError = new ImportError(
      "Failed to trigger import job",
      ImportErrorCode.JOB_TRIGGER_FAILED,
      {
        filename,
        rowCount,
        originalError: error instanceof Error ? error.message : String(error),
      }
    );

    logger.error("CSV Service", importError, {
      code: importError.code,
      context: importError.context,
    });

    return {
      errors: [importError.message],
    };
  }

  /**
   * Get import job status
   * Polls job progress and returns results when complete
   */
  async getImportStatus(jobId: string): Promise<ImportJobStatus> {
    // Handle synthetic job IDs from sync mode
    if (jobId.startsWith("sync-")) {
      logger.info("CSV Service", "Returning mock completed status for sync job", {
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
      output: run.output
        ? {
            success: run.output.success,
            companiesAdded: run.output.companiesAdded,
            companiesUpdated: run.output.companiesUpdated,
            leadsAdded: run.output.leadsAdded,
            leadsSkipped: run.output.leadsSkipped,
            totalRows: run.output.totalRows,
            qualifiedCount: run.output.qualifiedCount,
            rankedCount: run.output.rankedCount,
            rankingJobId: run.output.rankingJobId,
          }
        : undefined,
    };
  }

  /**
   * Check if there are any active upload jobs
   * Used to prevent concurrent uploads
   */
  async hasActiveUploads(): Promise<boolean> {
    const activeRuns = await runs.list({
      status: ["QUEUED", "EXECUTING", "WAITING", "DELAYED"],
      taskIdentifier: [TASK_IDS.IMPORT_CSV, TASK_IDS.RANK_LEADS],
      limit: 1,
    });

    return activeRuns.data.length > 0;
  }

  /**
   * Get upload history
   * Returns recent uploads with their status and results
   */
  async getUploadHistory(): Promise<UploadHistory[]> {
    const recentUploads = await db
      .select()
      .from(uploads)
      .orderBy(desc(uploads.createdAt))
      .limit(API_CONFIG.HISTORY_LIMIT);

    return recentUploads.map((upload) => ({
      id: upload.id,
      jobId: upload.jobId,
      filename: upload.filename,
      status: upload.status as "queued" | "processing" | "completed" | "failed",
      totalRows: upload.totalRows || 0,
      companiesAdded: upload.companiesAdded || 0,
      companiesUpdated: upload.companiesUpdated || 0,
      leadsAdded: upload.leadsAdded || 0,
      leadsSkipped: upload.leadsSkipped || 0,
      rankingJobId: upload.rankingJobId,
      errorMessage: upload.errorMessage,
      createdAt: upload.createdAt.toISOString(),
      completedAt: upload.completedAt?.toISOString() || null,
    }));
  }
}

export const csvService = CSVService.getInstance();
