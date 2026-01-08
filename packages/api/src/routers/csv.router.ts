import { publicProcedure } from "../index";
import { services } from "../services";
import { uploadCSVInputSchema, uploadCSVOutputSchema, uploadHistorySchema } from "../schemas/csv";
import { jobIdSchema } from "../schemas/jobs";
import { importJobStatusSchema } from "../schemas/import";
import { z } from "zod";

/**
 * CSV Router
 * Handles CSV upload and import operations (async via background jobs)
 */
export const csvRouter = {
  /**
   * Upload CSV file (async)
   * Parses and validates CSV, then triggers background import job
   * Returns immediately with job ID for status tracking
   */
  upload: publicProcedure
    .input(uploadCSVInputSchema)
    .output(uploadCSVOutputSchema)
    .handler(async ({ input }) => services.csv.uploadAndImport(input.file)),

  /**
   * Get status of import job
   * Polls job progress and returns results when complete
   */
  importStatus: publicProcedure
    .input(jobIdSchema)
    .output(importJobStatusSchema)
    .handler(async ({ input }) => services.csv.getImportStatus(input.jobId)),

  /**
   * Check if there are any active upload jobs
   * Used to prevent concurrent uploads
   */
  hasActiveUploads: publicProcedure
    .output(z.object({ hasActive: z.boolean() }))
    .handler(async () => ({ hasActive: await services.csv.hasActiveUploads() })),

  /**
   * Get upload history
   * Returns recent uploads with their status and results
   */
  history: publicProcedure
    .output(z.array(uploadHistorySchema))
    .handler(async () => services.csv.getUploadHistory()),
};
