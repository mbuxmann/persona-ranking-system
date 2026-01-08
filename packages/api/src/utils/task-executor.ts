import { env } from "@leads/env/server";
import { importCSVTask } from "../trigger/import-csv.task";
import { rankLeadsTask } from "../trigger/rank-leads.task";
import { optimizePromptTask } from "../trigger/optimize-prompt.task";
import { services } from "../services";
import type { CSVRow } from "../schemas/csv";
import { logger } from "./logger";

/**
 * Generate a synthetic job ID for synchronous task execution (dev mode)
 */
export function generateSyncJobId(): string {
  return `sync-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function executeImportWorkflow(payload: {
  csvData: CSVRow[];
  filename: string;
  uploadId: string;
}): Promise<{
  jobId: string;
  result?: {
    success: boolean;
    companiesAdded: number;
    companiesUpdated: number;
    leadsAdded: number;
    leadsSkipped: number;
    totalRows: number;
    qualifiedCount: number;
    rankedCount: number;
    rankingJobId: null;
  };
}> {
  if (env.USE_TRIGGER_QUEUES) {
    logger.info("Task Executor", "Triggering async import via Trigger.dev queue", {
      filename: payload.filename,
      rowCount: payload.csvData.length,
    });

    const handle = await importCSVTask.trigger(payload);
    return { jobId: handle.id, result: undefined };
  }

  logger.info("Task Executor", "Executing import workflow synchronously (dev mode)", {
    filename: payload.filename,
    rowCount: payload.csvData.length,
  });

  const jobId = generateSyncJobId();
  const result = await services.import.importCsvWorkflow({
    csvData: payload.csvData,
    filename: payload.filename,
    uploadId: payload.uploadId,
    jobId,
  });

  logger.info("Task Executor", "Synchronous import complete", {
    jobId,
    companiesAdded: result.companiesAdded,
    leadsAdded: result.leadsAdded,
  });

  return { jobId, result };
}

export async function executeRankingWorkflow(payload: {
  leadIds?: string[];
}): Promise<{
  jobId: string;
  result?: {
    success: boolean;
    sessionId: string;
    rankedCount: number;
    totalQualifiedLeads: number;
  };
}> {
  const leadCount = payload.leadIds?.length || "ALL";

  if (env.USE_TRIGGER_QUEUES) {
    logger.info("Task Executor", "Triggering async ranking via Trigger.dev queue", { leadCount });
    const handle = await rankLeadsTask.trigger(payload);
    return { jobId: handle.id, result: undefined };
  }

  logger.info("Task Executor", "Executing ranking workflow synchronously (dev mode)", { leadCount });

  const jobId = generateSyncJobId();
  const result = await services.ranking.rankLeadsWorkflow({
    ...payload,
    jobId,
  });

  logger.info("Task Executor", "Synchronous ranking complete", {
    jobId,
    rankedCount: result.rankedCount,
  });

  return { jobId, result };
}

export async function executeOptimizationWorkflow(payload: {
  startingPromptId: string;
  maxIterations?: number;
  variantsPerIteration?: number;
  beamWidth?: number;
}): Promise<{
  jobId: string;
  result?: {
    success: boolean;
    runId: string;
    bestPromptId: string;
    improvementPercentage: number;
  };
}> {
  if (env.USE_TRIGGER_QUEUES) {
    logger.info("Task Executor", "Triggering async optimization via Trigger.dev queue", {
      startingPromptId: payload.startingPromptId,
      maxIterations: payload.maxIterations,
      variantsPerIteration: payload.variantsPerIteration,
      beamWidth: payload.beamWidth,
    });

    const handle = await optimizePromptTask.trigger(payload);
    return { jobId: handle.id, result: undefined };
  }

  logger.info("Task Executor", "Executing optimization workflow synchronously (dev mode)", {
    startingPromptId: payload.startingPromptId,
    maxIterations: payload.maxIterations,
    variantsPerIteration: payload.variantsPerIteration,
    beamWidth: payload.beamWidth,
  });

  const jobId = generateSyncJobId();
  const result = await services.promptOptimization.optimizePromptWorkflow({
    startingPromptId: payload.startingPromptId,
    maxIterations: payload.maxIterations,
    variantsPerIteration: payload.variantsPerIteration,
    beamWidth: payload.beamWidth,
    jobId,
  });

  logger.info("Task Executor", "Synchronous optimization complete", {
    jobId,
    bestPromptId: result.bestPromptId,
    improvementPercentage: result.improvementPercentage,
  });

  return { jobId, result };
}
