import { task } from "@trigger.dev/sdk";
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

    return await services.import.importCsvWorkflow({
      csvData: validatedPayload.csvData,
      filename: validatedPayload.filename,
      uploadId: validatedPayload.uploadId,
      jobId: ctx.run.id,
    });
  },
});
