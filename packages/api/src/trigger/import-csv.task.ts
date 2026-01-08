import { task, logger } from "@trigger.dev/sdk";
import { services } from "../services";
import { TASK_IDS } from "../config/constants";
import { importCsvPayloadSchema, type ImportCsvPayload } from "../schemas/trigger-payloads";

export const importCSVTask = task({
  id: TASK_IDS.IMPORT_CSV,
  retry: {
    maxAttempts: 3,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: ImportCsvPayload, { ctx }) => {
    const validatedPayload = importCsvPayloadSchema.parse(payload);

    logger.info("Starting CSV import workflow", {
      filename: validatedPayload.filename,
      uploadId: validatedPayload.uploadId,
      csvDataLength: validatedPayload.csvData.length,
    });

    const result = await services.import.importCsvWorkflow({
      csvData: validatedPayload.csvData,
      filename: validatedPayload.filename,
      uploadId: validatedPayload.uploadId,
      jobId: ctx.run.id,
    });

    logger.info("CSV import workflow complete", {
      companiesAdded: result.companiesAdded,
      leadsAdded: result.leadsAdded,
    });

    return result;
  },
});
