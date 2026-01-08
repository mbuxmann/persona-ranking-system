import { z } from "zod";

/**
 * Schema for CSV row structure
 * Matches the format in leads.csv:
 * account_name,lead_first_name,lead_last_name,lead_job_title,account_domain,account_employee_range,account_industry
 */
export const csvRowSchema = z.object({
  account_name: z.string().min(1, "Company name is required"),
  lead_first_name: z.string().min(1, "First name is required"),
  lead_last_name: z.string().min(1, "Last name is required"),
  lead_job_title: z.string().default(""),
  account_domain: z.string().min(1, "Domain is required"),
  account_employee_range: z.string().default(""),
  account_industry: z.string().default(""),
});

export type CSVRow = z.infer<typeof csvRowSchema>;

/**
 * Schema for CSV upload API input
 * Uses z.file() for native file upload support via multipart/form-data
 */
export const uploadCSVInputSchema = z.object({
  file: z
    .file()
    .refine((file) => file.type === "text/csv" || file.name.endsWith(".csv"), {
      message: "File must be a CSV",
    })
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File must be less than 5MB",
    }),
});

/**
 * Schema for detailed validation error with row information
 */
export const validationErrorSchema = z.object({
  rowNumber: z.number(),
  field: z.string(),
  message: z.string(),
  value: z.string().optional(),
});

export type ValidationError = z.infer<typeof validationErrorSchema>;

/**
 * Schema for CSV upload API output (async)
 * Returns job ID for tracking import progress
 * Use csv.importStatus to get detailed results
 */
export const uploadCSVOutputSchema = z.object({
  importJobId: z.string().optional(),
  errors: z.array(z.string()),
  validationErrors: z.array(validationErrorSchema).optional(),
  totalRows: z.number().optional(),
  validRows: z.number().optional(),
});

/**
 * Schema for ranked lead rows from database query
 * Used when exporting CSV data
 */
export const rankedLeadRowSchema = z.object({
  company_name: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  job_title: z.string(),
  employee_range: z.string().nullable(),
  rank_score: z.string().nullable(),
  reasoning: z.string().nullable(),
});

export type RankedLeadRow = z.infer<typeof rankedLeadRowSchema>;

/**
 * Schema for upload history output
 */
export const uploadHistorySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  filename: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  totalRows: z.number(),
  companiesAdded: z.number(),
  companiesUpdated: z.number(),
  leadsAdded: z.number(),
  leadsSkipped: z.number(),
  rankingJobId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export type UploadHistory = z.infer<typeof uploadHistorySchema>;
