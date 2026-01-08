import { db } from "@leads/db";
import { evaluationLeads, evaluationResults, promptVersions } from "@leads/db";
import { eq, isNotNull } from "@leads/db/drizzle";
import { parallel } from "radash";
import { rankingAgent } from "../agents/ranking.agent";
import { logger } from "../utils/logger";
import { utils } from "../utils";
import { rankingOutputArraySchema } from "../schemas/agent-outputs";
import { sampleRankCorrelation } from "simple-statistics";
import { RANKING_CONFIG } from "../config/constants";

interface PersistEvaluationParams {
  promptVersionId: string;
  rankings: { leadId: string; rank: number; reasoning: string }[];
  metrics: { mae: number; rmse: number; spearmanCorrelation: number; kendallTau: number };
}

interface EvaluationMetrics {
  mae: number;
  rmse: number;
  spearmanCorrelation: number;
  kendallTau: number;
}

type EvalLead = typeof evaluationLeads.$inferSelect;

interface EvaluationCoreResult {
  metrics: EvaluationMetrics;
  rankings: { leadId: string; rank: number; reasoning: string }[];
  evalLeads: EvalLead[];
}

export interface InMemoryEvaluationResult {
  mae: number;
  rmse: number;
  spearmanCorrelation: number;
  kendallTau: number;
  rankings: { leadId: string; rank: number; reasoning: string }[];
}

/**
 * Evaluation Service
 * Handles prompt evaluation against ground truth data with metrics calculation
 */
export class EvaluationService {
  private static instance: EvaluationService;

  private constructor() {}

  static getInstance(): EvaluationService {
    if (!EvaluationService.instance) {
      EvaluationService.instance = new EvaluationService();
    }
    return EvaluationService.instance;
  }

  /** Core evaluation logic shared between persisting and non-persisting methods */
  private async runEvaluationCore(promptText: string): Promise<EvaluationCoreResult> {
    const { evalLeads, leadsByCompany } = await this.fetchAndGroupEvaluationLeads();

    const allRankings = await this.rankCompaniesInParallel(
      Array.from(leadsByCompany.entries()),
      promptText
    );

    const rankings = this.deduplicateRankings(allRankings, evalLeads);

    const alignedData = this.alignPredictionsWithGroundTruth(rankings, evalLeads);

    const metrics = this.computeEvaluationMetrics(alignedData);

    return { metrics, rankings, evalLeads };
  }

  /** Fetches evaluation leads with ground truth and groups them by company */
  private async fetchAndGroupEvaluationLeads(): Promise<{
    evalLeads: EvalLead[];
    leadsByCompany: Map<string, EvalLead[]>;
  }> {
    const evalLeads = await db.select()
      .from(evaluationLeads)
      .where(isNotNull(evaluationLeads.groundTruthRank));

    logger.info("Evaluation Service", "Fetched ranked evaluation leads", {
      count: evalLeads.length,
    });

    const leadsByCompany = utils.groupBy(evalLeads, (lead) => lead.companyName);

    logger.info("Evaluation Service", "Grouped evaluation leads by company", {
      totalCompanies: leadsByCompany.size,
    });

    return { evalLeads, leadsByCompany };
  }

  /** Ranks all companies in parallel with controlled concurrency */
  private async rankCompaniesInParallel(
    companyEntries: [string, EvalLead[]][],
    promptText: string
  ): Promise<{ leadId: string; rank: number; reasoning: string }[]> {
    logger.info("Evaluation Service", "Ranking companies in parallel", {
      totalCompanies: companyEntries.length,
      concurrency: RANKING_CONFIG.CONCURRENCY,
    });

    const rankingResults = await parallel(
      RANKING_CONFIG.CONCURRENCY,
      companyEntries,
      async ([companyName, companyLeads]) => {
        logger.info("Evaluation Service", "Ranking company leads", {
          company: companyName,
          leadsToRank: companyLeads.length,
        });

        const rawRankings = await rankingAgent.rankQualifiedLeads({
          leads: companyLeads.map(lead => ({
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            jobTitle: lead.jobTitle,
            companyName: lead.companyName,
            companyDomain: lead.companyDomain || "",
            employeeRange: lead.employeeRange,
            industry: lead.industry,
          })),
          promptTemplate: promptText,
        });
        return rankingOutputArraySchema.parse(rawRankings);
      }
    );

    return rankingResults.flat();
  }

  /** Removes duplicate rankings and filters to valid evaluation leads */
  private deduplicateRankings(
    allRankings: { leadId: string; rank: number; reasoning: string }[],
    evalLeads: EvalLead[]
  ): { leadId: string; rank: number; reasoning: string }[] {
    const validEvalLeadIds = new Set(evalLeads.map(l => l.id));
    const rankings = Array.from(
      new Map(
        allRankings
          .filter(r => validEvalLeadIds.has(r.leadId))
          .map(r => [r.leadId, r])
      ).values()
    );

    logger.info("Evaluation Service", "Ranked all evaluation leads", {
      totalRankings: rankings.length,
      totalLeads: evalLeads.length,
      duplicatesRemoved: allRankings.length - rankings.length,
    });

    return rankings;
  }

  /** Aligns predicted rankings with ground truth for metrics calculation */
  private alignPredictionsWithGroundTruth(
    rankings: { leadId: string; rank: number; reasoning: string }[],
    evalLeads: EvalLead[]
  ): { groundTruth: number; predicted: number }[] {
    const predictedRankMap = new Map(rankings.map(r => [r.leadId, r.rank]));
    const alignedData = evalLeads
      .map(lead => ({
        groundTruth: lead.groundTruthRank,
        predicted: predictedRankMap.get(lead.id),
      }))
      .filter((d): d is { groundTruth: number; predicted: number } => d.predicted !== undefined);

    if (alignedData.length !== evalLeads.length) {
      logger.warn("Evaluation Service", "Some leads missing predictions", {
        expectedLeads: evalLeads.length,
        matchedLeads: alignedData.length,
        missingCount: evalLeads.length - alignedData.length,
      });
    }

    return alignedData;
  }

  /** Computes MAE, RMSE, Spearman correlation, and Kendall tau metrics */
  private computeEvaluationMetrics(
    alignedData: { groundTruth: number; predicted: number }[]
  ): EvaluationMetrics {
    const groundTruthRanks = alignedData.map(d => d.groundTruth);
    const predictedRanks = alignedData.map(d => d.predicted);

    return {
      mae: this.calculateMAE(predictedRanks, groundTruthRanks),
      rmse: this.calculateRMSE(predictedRanks, groundTruthRanks),
      spearmanCorrelation: sampleRankCorrelation(groundTruthRanks, predictedRanks),
      kendallTau: this.calculateKendallTau(groundTruthRanks, predictedRanks),
    };
  }

  /** Builds evaluation result records with error calculations */
  private buildEvaluationRecords(
    promptVersionId: string,
    rankings: { leadId: string; rank: number; reasoning: string }[],
    evalLeadMap: Map<string, EvalLead>
  ) {
    return rankings
      .filter(r => evalLeadMap.has(r.leadId))
      .map(ranking => {
        const groundTruth = evalLeadMap.get(ranking.leadId)!;
        return {
          promptVersionId,
          evaluationLeadId: ranking.leadId,
          predictedRank: ranking.rank,
          predictedReasoning: ranking.reasoning,
          absoluteError: Math.abs(ranking.rank - groundTruth.groundTruthRank).toString(),
          squaredError: Math.pow(ranking.rank - groundTruth.groundTruthRank, 2).toString(),
        };
      });
  }

  /** Imports evaluation dataset from CSV with ground truth rankings */
  async importEvaluationDataset(rawCsvData: Array<{
    "Full Name": string;
    "Title": string;
    "Company": string;
    "Employee Range": string;
    "Rank": string;
  }>) {
    const viableLeads = rawCsvData.filter(row => row.Rank !== "-");

    logger.info("Evaluation Service", "Importing evaluation dataset", {
      totalRows: rawCsvData.length,
      viableLeads: viableLeads.length,
    });

    const transformedData = viableLeads.map(row => {
      const [firstName = "Unknown", ...lastNameParts] = row["Full Name"].split(" ");
      const lastName = lastNameParts.join(" ") || firstName;

      const rank = parseInt(row.Rank, 10);
      if (isNaN(rank) || rank < 0 || rank > 100) {
        throw new Error(`Invalid rank value "${row.Rank}" for lead "${row["Full Name"]}"`);
      }

      return {
        firstName,
        lastName,
        jobTitle: row.Title,
        companyName: row.Company,
        companyDomain: null,
        employeeRange: row["Employee Range"],
        industry: null,
        groundTruthRank: rank,
        groundTruthReasoning: null,
      };
    });

    const inserted = await db.insert(evaluationLeads).values(transformedData).returning();

    logger.info("Evaluation Service", "Successfully imported evaluation dataset", {
      imported: transformedData.length,
      insertedCount: inserted.length,
    });

    return { count: inserted.length, imported: transformedData.length };
  }

  /** Evaluates a prompt version and persists results to database */
  async evaluatePrompt(promptVersionId: string, promptText: string) {
    logger.info("Evaluation Service", "Starting prompt evaluation", {
      promptVersionId,
      promptLength: promptText.length,
    });

    const { metrics, rankings, evalLeads } = await this.runEvaluationCore(promptText);

    const evalLeadsMap = new Map(evalLeads.map(l => [l.id, l]));
    const evaluationRecords = this.buildEvaluationRecords(promptVersionId, rankings, evalLeadsMap);

    await db.insert(evaluationResults).values(evaluationRecords);

    logger.info("Evaluation Service", "Stored evaluation results", {
      resultsCount: evaluationRecords.length,
    });

    await db.update(promptVersions)
      .set({
        mae: metrics.mae.toString(),
        rmse: metrics.rmse.toString(),
        spearmanCorrelation: metrics.spearmanCorrelation.toString(),
        kendallTau: metrics.kendallTau.toString(),
      })
      .where(eq(promptVersions.id, promptVersionId));

    logger.info("Evaluation Service", "Evaluation complete", {
      mae: metrics.mae.toFixed(2),
      rmse: metrics.rmse.toFixed(2),
      spearman: metrics.spearmanCorrelation.toFixed(3),
      kendallTau: metrics.kendallTau.toFixed(3),
    });

    return metrics;
  }

  /** Evaluates a prompt in-memory without persisting results */
  async evaluatePromptWithoutPersisting(promptText: string): Promise<InMemoryEvaluationResult> {
    logger.info("Evaluation Service", "Starting in-memory prompt evaluation", {
      promptLength: promptText.length,
    });

    const { metrics, rankings } = await this.runEvaluationCore(promptText);

    logger.info("Evaluation Service", "In-memory evaluation complete", {
      mae: metrics.mae.toFixed(2),
      rmse: metrics.rmse.toFixed(2),
      spearman: metrics.spearmanCorrelation.toFixed(3),
      kendallTau: metrics.kendallTau.toFixed(3),
    });

    return { ...metrics, rankings };
  }

  /** Persists pre-computed evaluation results to database */
  async persistEvaluationResults({
    promptVersionId,
    rankings,
    metrics,
  }: PersistEvaluationParams) {
    const evalLeads = await db.select()
      .from(evaluationLeads)
      .where(isNotNull(evaluationLeads.groundTruthRank));

    const evalLeadMap = new Map(evalLeads.map(l => [l.id, l]));
    const evaluationRecords = this.buildEvaluationRecords(promptVersionId, rankings, evalLeadMap);

    if (evaluationRecords.length > 0) {
      await db.insert(evaluationResults).values(evaluationRecords);
    }

    await db.update(promptVersions)
      .set({
        mae: metrics.mae.toString(),
        rmse: metrics.rmse.toString(),
        spearmanCorrelation: metrics.spearmanCorrelation.toString(),
        kendallTau: metrics.kendallTau.toString(),
      })
      .where(eq(promptVersions.id, promptVersionId));

    logger.info("Evaluation Service", "Persisted evaluation results", {
      promptVersionId,
      resultsCount: evaluationRecords.length,
    });
  }

  /** Calculates Mean Absolute Error between predicted and actual values */
  private calculateMAE(predicted: number[], actual: number[]): number {
    if (predicted.length === 0 || actual.length === 0) {
      throw new Error("Cannot calculate MAE: empty arrays");
    }
    if (predicted.length !== actual.length) {
      throw new Error(`Length mismatch: ${predicted.length} vs ${actual.length}`);
    }
    const errors = predicted.map((p, i) => {
      const actualValue = actual[i];
      if (actualValue === undefined) {
        throw new Error(`Missing actual value at index ${i}`);
      }
      return Math.abs(p - actualValue);
    });
    return errors.reduce((sum, e) => sum + e, 0) / errors.length;
  }

  /** Calculates Root Mean Square Error between predicted and actual values */
  private calculateRMSE(predicted: number[], actual: number[]): number {
    if (predicted.length === 0 || actual.length === 0) {
      throw new Error("Cannot calculate RMSE: empty arrays");
    }
    if (predicted.length !== actual.length) {
      throw new Error(`Length mismatch: ${predicted.length} vs ${actual.length}`);
    }
    const squaredErrors = predicted.map((p, i) => {
      const actualValue = actual[i];
      if (actualValue === undefined) {
        throw new Error(`Missing actual value at index ${i}`);
      }
      return Math.pow(p - actualValue, 2);
    });
    const mse = squaredErrors.reduce((sum, e) => sum + e, 0) / squaredErrors.length;
    return Math.sqrt(mse);
  }

  /** Calculates Kendall Tau rank correlation coefficient */
  private calculateKendallTau(x: number[], y: number[]): number {
    if (x.length === 0 || y.length === 0) {
      throw new Error("Cannot calculate Kendall Tau: empty arrays");
    }
    const n = x.length;
    if (n !== y.length) {
      throw new Error(`Length mismatch: ${x.length} vs ${y.length}`);
    }

    let concordant = 0;
    let discordant = 0;
    let tiesX = 0;
    let tiesY = 0;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const signX = Math.sign(x[j]! - x[i]!);
        const signY = Math.sign(y[j]! - y[i]!);

        if (signX === signY && signX !== 0) {
          concordant++;
        } else if (signX === -signY && signX !== 0) {
          discordant++;
        }

        if (signX === 0 && signY !== 0) tiesX++;
        if (signY === 0 && signX !== 0) tiesY++;
      }
    }

    const n0 = (n * (n - 1)) / 2;
    const n1 = n0 - tiesX;
    const n2 = n0 - tiesY;

    if (n1 === 0 || n2 === 0) {
      return 0;
    }

    return (concordant - discordant) / Math.sqrt(n1 * n2);
  }
}

export const evaluationService = EvaluationService.getInstance();
