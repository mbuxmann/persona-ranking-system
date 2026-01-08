import { db } from "@leads/db";
import { promptVersions, optimizationRuns, evaluationLeads, evaluationResults } from "@leads/db";
import { eq, sql, desc, asc } from "@leads/db/drizzle";
import { runs } from "@trigger.dev/sdk";
import type { EvaluationMetrics, SampleError } from "../types/evaluation";
import type { BeamCandidate, OptimizationConfig } from "../types/optimization";
import type { PromptVersion, PromptVersionSummary, ActivePrompt, OptimizationRun, EvaluationExport, OptimizationStatus, StartOptimizationInput } from "../schemas/prompt-optimization";
import { gradientGenerator } from "../agents/gradient-generator.agent";
import { variantGenerator } from "../agents/variant-generator.agent";
import { logger } from "../utils/logger";
import { stringify } from "csv-stringify/sync";
import { executeOptimizationWorkflow } from "../utils/task-executor";
import { TriggerRunStatus, isCompletedStatus } from "../utils/trigger";

// Re-export types for consumers that import from this service
export type { BeamCandidate, OptimizationConfig };

// Beam search optimization constants
const SAMPLE_ERRORS_LIMIT = 10;
const CONVERGENCE_THRESHOLD = 0.01;
const MIN_ITERATIONS_BEFORE_CONVERGENCE = 2;
const MAX_TRAJECTORY_SIZE = 50;

interface OptimizePromptWorkflowParams {
  startingPromptId: string;
  maxIterations?: number;
  variantsPerIteration?: number;
  beamWidth?: number;
  jobId: string;
}

export interface OptimizePromptWorkflowResult {
  success: boolean;
  runId: string;
  bestPromptId: string;
  improvementPercentage: number;
}

interface CreateOptimizationRunParams {
  startingPromptId: string;
  config: OptimizationConfig;
}

interface CompleteOptimizationRunParams {
  runId: string;
  bestPromptId: string;
  bestMetrics: EvaluationMetrics;
  baselineMetrics: EvaluationMetrics;
  totalIterations: number;
  totalPromptsGenerated: number;
}

interface PersistNewPromptVersionParams {
  promptText: string;
  parentVersionId: string;
  optimizationRunId: string;
  iteration: number;
  beamRank: number;
  metrics: EvaluationMetrics;
  rankings: { leadId: string; rank: number; reasoning: string }[];
}

// Beam search optimization types
interface InMemoryCandidate extends EvaluationMetrics {
  id?: string;  // Only set for existing prompts (baseline)
  promptText: string;
  parentVersionId: string;
  rankings: { leadId: string; rank: number; reasoning: string }[];
}

interface OptimizationState {
  run: typeof optimizationRuns.$inferSelect;
  beam: InMemoryCandidate[];
  allCandidates: InMemoryCandidate[];
  baselineMetrics: EvaluationMetrics;
  baselineCandidate: InMemoryCandidate;
}

interface RunBeamSearchParams {
  startingPromptId: string;
  config: OptimizationConfig;
}

interface CheckConvergenceParams {
  newBest: InMemoryCandidate;
  previousBest: InMemoryCandidate;
  iteration: number;
}

interface EvaluateVariantsParams {
  variants: string[];
  parentVersionId: string;
  iteration: number;
}

interface FinalizeOptimizationParams {
  state: OptimizationState;
  convergedEarly: boolean;
  finalIteration: number;
}

interface RunIterationParams {
  state: OptimizationState;
  config: OptimizationConfig;
  iteration: number;
}

interface RunOptimizationLoopParams {
  state: OptimizationState;
  config: OptimizationConfig;
}

interface UpdateBeamParams {
  state: OptimizationState;
  inMemoryCandidates: InMemoryCandidate[];
  beamWidth: number;
  iteration: number;
}

interface PrepareGradientParams {
  currentBest: InMemoryCandidate;
  iteration: number;
}

interface GenerateAndEvaluateParams {
  currentBest: InMemoryCandidate;
  gradient: string;
  state: OptimizationState;
  config: OptimizationConfig;
  iteration: number;
}

/**
 * Prompt Optimization Service
 * Handles prompt versioning, beam search optimization, and evaluation exports
 */
export class PromptOptimizationService {
  private static instance: PromptOptimizationService;

  private constructor() {}

  static getInstance(): PromptOptimizationService {
    if (!PromptOptimizationService.instance) {
      PromptOptimizationService.instance = new PromptOptimizationService();
    }
    return PromptOptimizationService.instance;
  }

  /** Executes the full prompt optimization workflow */
  async optimizePromptWorkflow({
    startingPromptId,
    maxIterations,
    variantsPerIteration,
    beamWidth,
    jobId,
  }: OptimizePromptWorkflowParams): Promise<OptimizePromptWorkflowResult> {
    logger.info("Prompt Optimization Service", "Starting optimization workflow", {
      jobId,
      startingPromptId,
      maxIterations,
      variantsPerIteration,
      beamWidth,
    });

    const config = {
      maxIterations: maxIterations || 5,
      variantsPerIteration: variantsPerIteration || 8,
      beamWidth: beamWidth || 3,
    };

    const result = await this.runBeamSearchOptimization({ startingPromptId, config });

    logger.info("Prompt Optimization Service", "Optimization completed", {
      jobId,
      runId: result.runId,
      bestPromptId: result.bestPromptId,
      improvementPercentage: result.improvement.toFixed(1),
    });

    return {
      success: true,
      runId: result.runId,
      bestPromptId: result.bestPromptId,
      improvementPercentage: result.improvement,
    };
  }

  /** Creates a new optimization run record in the database */
  async createOptimizationRun({ startingPromptId, config }: CreateOptimizationRunParams) {
    const [run] = await db.insert(optimizationRuns).values({
      startingPromptId,
      maxIterations: config.maxIterations,
      variantsPerIteration: config.variantsPerIteration,
      beamWidth: config.beamWidth,
      status: "running",
    }).returning();

    if (!run) {
      throw new Error("Failed to create optimization run");
    }

    return run;
  }

  /** Loads baseline metrics or evaluates if not yet computed */
  async loadOrEvaluateBaseline(startingPromptId: string): Promise<{
    baselineMetrics: EvaluationMetrics;
    initialBeam: InMemoryCandidate[];
  }> {
    const [startingPrompt] = await db.select().from(promptVersions).where(eq(promptVersions.id, startingPromptId));

    if (!startingPrompt) {
      throw new Error(`Starting prompt ${startingPromptId} not found`);
    }

    let baselineMetrics: EvaluationMetrics;

    if (!startingPrompt.mae || !startingPrompt.kendallTau) {
      logger.info("Prompt Optimization Service", "Baseline prompt not evaluated, evaluating now", {
        promptId: startingPrompt.id,
      });

      // Lazy import to avoid circular dependency
      const { services } = await import("../services");
      baselineMetrics = await services.evaluation.evaluatePrompt(
        startingPrompt.id,
        startingPrompt.promptText
      );

      logger.info("Prompt Optimization Service", "Baseline prompt evaluated", {
        promptId: startingPrompt.id,
        mae: baselineMetrics.mae.toFixed(2),
        kendallTau: baselineMetrics.kendallTau.toFixed(3),
        spearman: baselineMetrics.spearmanCorrelation.toFixed(3),
      });
    } else {
      baselineMetrics = {
        mae: Number(startingPrompt.mae),
        rmse: Number(startingPrompt.rmse),
        spearmanCorrelation: Number(startingPrompt.spearmanCorrelation),
        kendallTau: Number(startingPrompt.kendallTau),
      };
    }

    return {
      baselineMetrics,
      initialBeam: [{
        id: startingPrompt.id,
        promptText: startingPrompt.promptText,
        parentVersionId: startingPrompt.id, // Baseline is its own parent
        rankings: [], // Baseline doesn't need rankings for persistence
        mae: baselineMetrics.mae,
        rmse: baselineMetrics.rmse,
        spearmanCorrelation: baselineMetrics.spearmanCorrelation,
        kendallTau: baselineMetrics.kendallTau,
      }],
    };
  }

  /** Retrieves sample errors for a prompt version sorted by largest error */
  async getSampleErrors(promptVersionId: string, limit: number): Promise<SampleError[]> {
    const results = await db.select({
      predicted: evaluationResults.predictedRank,
      reasoning: evaluationResults.predictedReasoning,
      groundTruth: evaluationLeads.groundTruthRank,
      firstName: evaluationLeads.firstName,
      lastName: evaluationLeads.lastName,
      jobTitle: evaluationLeads.jobTitle,
      companyName: evaluationLeads.companyName,
    })
    .from(evaluationResults)
    .innerJoin(evaluationLeads, eq(evaluationResults.evaluationLeadId, evaluationLeads.id))
    .where(eq(evaluationResults.promptVersionId, promptVersionId))
    .orderBy(sql`ABS(${evaluationResults.predictedRank} - ${evaluationLeads.groundTruthRank}) DESC`)
    .limit(limit);

    return results.map(r => ({
      predicted: r.predicted,
      groundTruth: r.groundTruth,
      reasoning: r.reasoning,
      leadInfo: `${r.firstName} ${r.lastName} - ${r.jobTitle} at ${r.companyName}`,
    }));
  }

  /** Computes sample errors from in-memory rankings (for candidates not yet persisted) */
  async getSampleErrorsFromRankings(
    rankings: { leadId: string; rank: number; reasoning: string }[],
    limit: number
  ): Promise<SampleError[]> {
    if (rankings.length === 0) return [];

    const leadIds = rankings.map(r => r.leadId);
    const leads = await db.select()
      .from(evaluationLeads)
      .where(sql`${evaluationLeads.id} IN ${leadIds}`);

    const leadMap = new Map(leads.map(l => [l.id, l]));

    const errors = rankings
      .map(r => {
        const lead = leadMap.get(r.leadId);
        if (!lead) return null;
        return {
          predicted: r.rank,
          groundTruth: lead.groundTruthRank,
          reasoning: r.reasoning,
          leadInfo: `${lead.firstName} ${lead.lastName} - ${lead.jobTitle} at ${lead.companyName}`,
          error: Math.abs(r.rank - lead.groundTruthRank),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.error - a.error)
      .slice(0, limit);

    return errors.map(({ error, ...rest }) => rest);
  }

  /** Persists a new prompt version with evaluation results */
  async persistNewPromptVersion(params: PersistNewPromptVersionParams): Promise<BeamCandidate> {
    const { promptText, parentVersionId, optimizationRunId, iteration, beamRank, metrics, rankings } = params;

    const [version] = await db.insert(promptVersions).values({
      iterationNumber: iteration,
      promptText,
      parentVersionId,
      optimizationRunId,
      isActive: false,
      isBaseline: false,
      beamRank,
    }).returning();

    if (!version) {
      throw new Error("Failed to create prompt version");
    }

    // Lazy import to avoid circular dependency
    const { services } = await import("../services");
    await services.evaluation.persistEvaluationResults({
      promptVersionId: version.id,
      rankings,
      metrics,
    });

    return {
      id: version.id,
      promptText,
      mae: metrics.mae,
      rmse: metrics.rmse,
      spearmanCorrelation: metrics.spearmanCorrelation,
      kendallTau: metrics.kendallTau,
    };
  }

  /** Updates the beam rank for a prompt version */
  async updateBeamRank(promptVersionId: string, beamRank: number): Promise<void> {
    await db.update(promptVersions)
      .set({ beamRank })
      .where(eq(promptVersions.id, promptVersionId));
  }

  /** Marks an optimization run as completed with final metrics */
  async completeOptimizationRun(params: CompleteOptimizationRunParams): Promise<void> {
    const { runId, bestPromptId, bestMetrics, baselineMetrics, totalIterations, totalPromptsGenerated } = params;

    const improvementPct = baselineMetrics.kendallTau !== 0
      ? ((bestMetrics.kendallTau - baselineMetrics.kendallTau) / Math.abs(baselineMetrics.kendallTau)) * 100
      : 0;

    await db.update(optimizationRuns)
      .set({
        status: "completed",
        bestPromptId,
        totalIterations,
        totalPromptsGenerated,
        improvementPercentage: improvementPct.toString(),
        completedAt: new Date(),
      })
      .where(eq(optimizationRuns.id, runId));

    logger.info("Prompt Optimization Service", "Optimization run completed", {
      runId,
      bestPromptId,
      bestKendall: bestMetrics.kendallTau.toFixed(3),
      bestSpearman: bestMetrics.spearmanCorrelation.toFixed(3),
      bestMAE: bestMetrics.mae.toFixed(2),
      improvement: `${improvementPct.toFixed(1)}%`,
      totalIterations,
      totalPromptsGenerated,
    });
  }

  /** Marks an optimization run as failed with error message */
  async markOptimizationRunFailed(runId: string, error: unknown): Promise<void> {
    logger.error("Prompt Optimization Service", error);

    await db.update(optimizationRuns)
      .set({
        status: "failed",
        errorMessage: String(error),
        completedAt: new Date(),
      })
      .where(eq(optimizationRuns.id, runId));
  }

  // ============================================================================
  // Beam Search Optimization Methods
  // ============================================================================

  /** Runs beam search optimization to improve a prompt using gradient-based feedback */
  private async runBeamSearchOptimization(params: RunBeamSearchParams) {
    const { startingPromptId, config } = params;
    logger.info("Prompt Optimization Service", "Starting beam search optimization", { startingPromptId, ...config });

    const run = await this.createOptimizationRun({ startingPromptId, config });

    try {
      const state = await this.initializeOptimizationState(run, startingPromptId);
      const { convergedEarly, finalIteration } = await this.runOptimizationLoop({ state, config });
      return await this.finalizeOptimization({ state, convergedEarly, finalIteration });
    } catch (error) {
      return this.handleBeamSearchError(run.id, error);
    }
  }

  /** Loads baseline prompt and initializes optimization state */
  private async initializeOptimizationState(
    run: typeof optimizationRuns.$inferSelect,
    startingPromptId: string
  ): Promise<OptimizationState> {
    const { baselineMetrics, initialBeam } = await this.loadOrEvaluateBaseline(startingPromptId);
    const baselineCandidate = initialBeam[0];
    if (!baselineCandidate) {
      throw new Error("Failed to load baseline prompt");
    }
    return {
      run,
      beam: initialBeam,
      allCandidates: [],
      baselineMetrics,
      baselineCandidate,
    };
  }

  /** Marks run as failed and re-throws the error */
  private async handleBeamSearchError(runId: string, error: unknown): Promise<never> {
    await this.markOptimizationRunFailed(runId, error);
    throw error;
  }

  /** Returns true if improvement is below threshold after minimum iterations */
  private checkConvergence(params: CheckConvergenceParams): boolean {
    const { newBest, previousBest, iteration } = params;
    const improvement = newBest.kendallTau - previousBest.kendallTau;
    if (improvement < CONVERGENCE_THRESHOLD && iteration > MIN_ITERATIONS_BEFORE_CONVERGENCE) {
      logger.info("Prompt Optimization Service", "Converged - minimal improvement", {
        iteration: iteration + 1,
        improvement: improvement.toFixed(4),
      });
      return true;
    }
    return false;
  }

  /** Evaluates prompt variants in parallel against ground truth */
  private async evaluateVariantsInMemory(params: EvaluateVariantsParams): Promise<InMemoryCandidate[]> {
    const { variants, parentVersionId, iteration } = params;

    // Lazy import to avoid circular dependency
    const { services } = await import("../services");

    const evaluationPromises = variants
      .filter((v): v is string => Boolean(v))
      .map(async (variantText) => {
        const result = await services.evaluation.evaluatePromptWithoutPersisting(variantText);
        return {
          promptText: variantText,
          parentVersionId,
          ...result,
        };
      });

    const candidates = await Promise.all(evaluationPromises);

    logger.info("Prompt Optimization Service", "Variants evaluated (parallel)", {
      iteration: iteration + 1,
      count: candidates.length,
      bestKendall: Math.max(...candidates.map(c => c.kendallTau)).toFixed(3),
    });

    return candidates;
  }

  /** Completes optimization run and calculates improvement percentage */
  private async finalizeOptimization(params: FinalizeOptimizationParams) {
    const { state, convergedEarly, finalIteration } = params;
    const bestInMemory = state.beam[0];
    if (!bestInMemory) {
      throw new Error("No best prompt found - beam is empty");
    }

    const actualIterations = convergedEarly ? finalIteration + 1 : finalIteration;

    // Persist final beam candidates to database
    const persistedBeam = await this.persistFinalBeam(state.beam, state.run.id, actualIterations);
    const bestPrompt = persistedBeam[0];
    if (!bestPrompt) {
      throw new Error("Failed to persist final beam");
    }

    await this.completeOptimizationRun({
      runId: state.run.id,
      bestPromptId: bestPrompt.id,
      bestMetrics: {
        mae: bestPrompt.mae,
        rmse: bestPrompt.rmse,
        spearmanCorrelation: bestPrompt.spearmanCorrelation,
        kendallTau: bestPrompt.kendallTau,
      },
      baselineMetrics: state.baselineMetrics,
      totalIterations: actualIterations,
      totalPromptsGenerated: state.allCandidates.length,
    });

    const improvementPct = state.baselineMetrics.kendallTau !== 0
      ? ((bestPrompt.kendallTau - state.baselineMetrics.kendallTau) / Math.abs(state.baselineMetrics.kendallTau)) * 100
      : 0;

    return {
      runId: state.run.id,
      bestPromptId: bestPrompt.id,
      improvement: improvementPct,
    };
  }

  /** Returns best candidate from beam, or baseline if beam is unexpectedly empty */
  private validateBeamState(beam: InMemoryCandidate[], context: string, state: OptimizationState): InMemoryCandidate {
    const currentBest = beam[0];
    if (!currentBest) {
      logger.error("Prompt Optimization Service", `Beam unexpectedly empty at: ${context}, recovering with baseline`);
      return state.baselineCandidate;
    }
    return currentBest;
  }

  /** Generates natural language gradient from current best's errors */
  private async prepareIterationGradient(params: PrepareGradientParams): Promise<string> {
    const { currentBest, iteration } = params;

    // Use persisted results if candidate has ID (baseline), otherwise compute from in-memory rankings
    const sampleErrors = currentBest.id
      ? await this.getSampleErrors(currentBest.id, SAMPLE_ERRORS_LIMIT)
      : await this.getSampleErrorsFromRankings(currentBest.rankings, SAMPLE_ERRORS_LIMIT);

    const gradient = await gradientGenerator.generateGradient({
      currentPrompt: currentBest.promptText,
      metrics: {
        mae: currentBest.mae,
        rmse: currentBest.rmse,
        spearmanCorrelation: currentBest.spearmanCorrelation,
        kendallTau: currentBest.kendallTau,
      },
      sampleErrors,
    });

    logger.info("Prompt Optimization Service", "Generated gradient", {
      iteration: iteration + 1,
      gradientLength: gradient.length,
    });

    return gradient;
  }

  /** Generates prompt variants from gradient and evaluates them */
  private async generateAndEvaluateVariants(params: GenerateAndEvaluateParams): Promise<InMemoryCandidate[]> {
    const { currentBest, gradient, state, config, iteration } = params;

    const variants = await variantGenerator.generateVariants({
      currentPrompt: currentBest.promptText,
      gradient,
      trajectory: state.allCandidates,
      numVariants: config.variantsPerIteration,
    });

    logger.info("Prompt Optimization Service", "Generated variants", {
      iteration: iteration + 1,
      variantCount: variants.length,
    });

    // Use currentBest's id if persisted, otherwise use its parent (for lineage tracking)
    const parentVersionId = currentBest.id || currentBest.parentVersionId;
    return this.evaluateVariantsInMemory({ variants, parentVersionId, iteration });
  }

  /** Executes a single optimization iteration: gradient, variants, beam update */
  private async runIteration(params: RunIterationParams): Promise<{ converged: boolean }> {
    const { state, config, iteration } = params;

    const currentBest = this.validateBeamState(state.beam, "start of iteration", state);

    logger.info("Prompt Optimization Service", `Iteration ${iteration + 1}/${config.maxIterations}`, {
      beamSize: state.beam.length,
      bestKendall: currentBest.kendallTau.toFixed(3),
    });

    const gradient = await this.prepareIterationGradient({ currentBest, iteration });

    const inMemoryCandidates = await this.generateAndEvaluateVariants({
      currentBest,
      gradient,
      state,
      config,
      iteration,
    });

    state.beam = this.updateBeam({ state, inMemoryCandidates, beamWidth: config.beamWidth, iteration });
    this.pruneTrajectory(state);

    const newBest = this.validateBeamState(state.beam, "after beam update", state);

    logger.info("Prompt Optimization Service", "Beam updated", {
      iteration: iteration + 1,
      beamSize: state.beam.length,
      bestKendall: newBest.kendallTau.toFixed(3),
      bestMAE: newBest.mae.toFixed(2),
    });

    return { converged: this.checkConvergence({ newBest, previousBest: currentBest, iteration }) };
  }

  /** Runs iterations until convergence or max iterations reached */
  private async runOptimizationLoop(
    params: RunOptimizationLoopParams
  ): Promise<{ convergedEarly: boolean; finalIteration: number }> {
    const { state, config } = params;
    let iteration = 0;

    for (iteration = 0; iteration < config.maxIterations; iteration++) {
      const { converged } = await this.runIteration({ state, config, iteration });
      if (converged) {
        return { convergedEarly: true, finalIteration: iteration };
      }
    }

    return { convergedEarly: false, finalIteration: iteration };
  }

  /** Replaces beam with top candidates from combined pool (in-memory only, no persistence) */
  private updateBeam(params: UpdateBeamParams): InMemoryCandidate[] {
    const { state, inMemoryCandidates, beamWidth } = params;

    // Combine existing beam with new candidates
    const combined: InMemoryCandidate[] = [...state.beam, ...inMemoryCandidates];

    // Sort by Kendall > Spearman > MAE (lower is better)
    const sorted = combined.sort((a, b) =>
      (b.kendallTau - a.kendallTau) ||
      (b.spearmanCorrelation - a.spearmanCorrelation) ||
      (a.mae - b.mae)
    );

    // Keep top N and add to allCandidates for trajectory
    const newBeam = sorted.slice(0, beamWidth);
    for (const candidate of inMemoryCandidates) {
      if (!state.allCandidates.some(c => c.promptText === candidate.promptText)) {
        state.allCandidates.push(candidate);
      }
    }

    return newBeam;
  }

  /** Persists final beam candidates to database at end of optimization */
  private async persistFinalBeam(
    beam: InMemoryCandidate[],
    runId: string,
    finalIteration: number
  ): Promise<BeamCandidate[]> {
    const persistedBeam: BeamCandidate[] = [];

    for (let rank = 0; rank < beam.length; rank++) {
      const candidate = beam[rank]!;

      // Skip baseline - it already exists in database
      if (candidate.id) {
        persistedBeam.push({
          id: candidate.id,
          promptText: candidate.promptText,
          mae: candidate.mae,
          rmse: candidate.rmse,
          spearmanCorrelation: candidate.spearmanCorrelation,
          kendallTau: candidate.kendallTau,
        });
        continue;
      }

      // Persist new candidate
      const persisted = await this.persistNewPromptVersion({
        promptText: candidate.promptText,
        parentVersionId: candidate.parentVersionId,
        optimizationRunId: runId,
        iteration: finalIteration,
        beamRank: rank + 1,
        metrics: {
          mae: candidate.mae,
          rmse: candidate.rmse,
          spearmanCorrelation: candidate.spearmanCorrelation,
          kendallTau: candidate.kendallTau,
        },
        rankings: candidate.rankings,
      });

      persistedBeam.push(persisted);
    }

    logger.info("Prompt Optimization Service", "Final beam persisted", {
      runId,
      persistedCount: persistedBeam.length,
    });

    return persistedBeam;
  }

  /** Prunes trajectory to top N candidates by performance */
  private pruneTrajectory(state: OptimizationState): void {
    if (state.allCandidates.length <= MAX_TRAJECTORY_SIZE) return;

    state.allCandidates = [...state.allCandidates]
      .sort((a, b) => b.kendallTau - a.kendallTau)
      .slice(0, MAX_TRAJECTORY_SIZE);

    logger.info("Prompt Optimization Service", "Pruned trajectory", {
      newSize: state.allCandidates.length,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /** Builds a map of run IDs to sequential run numbers */
  private buildRunNumberMap(runs: { id: string }[]): Map<string, number> {
    const map = new Map<string, number>();
    runs.forEach((run, index) => {
      map.set(run.id, index + 1);
    });
    return map;
  }

  /** Converts string metric values to numbers, handling nulls */
  private convertMetricsToNumbers(prompt: {
    mae: string | null;
    rmse: string | null;
    spearmanCorrelation: string | null;
    kendallTau: string | null;
  }) {
    return {
      mae: prompt.mae ? Number(prompt.mae) : null,
      rmse: prompt.rmse ? Number(prompt.rmse) : null,
      spearmanCorrelation: prompt.spearmanCorrelation ? Number(prompt.spearmanCorrelation) : null,
      kendallTau: prompt.kendallTau ? Number(prompt.kendallTau) : null,
    };
  }

  /** Computes human-readable version string (e.g., "2.1") */
  private computeVersionString(
    optimizationRunId: string | null,
    beamRank: number | null,
    runNumberMap: Map<string, number>
  ): string {
    if (!optimizationRunId) {
      return "1";
    }
    const runNumber = runNumberMap.get(optimizationRunId) || 1;
    return `${runNumber + 1}.${beamRank || 1}`;
  }

  /** Lists all prompt versions with computed version strings */
  async listPrompts(): Promise<PromptVersion[]> {
    logger.info("Prompt Optimization Service", "Listing all prompt versions");

    const [prompts, allRuns] = await Promise.all([
      db.select().from(promptVersions).orderBy(desc(promptVersions.createdAt)),
      db.select().from(optimizationRuns).orderBy(optimizationRuns.createdAt),
    ]);

    const runNumberMap = this.buildRunNumberMap(allRuns);

    return prompts.map(p => ({
      id: p.id,
      version: this.computeVersionString(p.optimizationRunId, p.beamRank, runNumberMap),
      iterationNumber: p.iterationNumber,
      optimizationRunId: p.optimizationRunId,
      promptText: p.promptText,
      isActive: p.isActive,
      isBaseline: p.isBaseline,
      beamRank: p.beamRank,
      ...this.convertMetricsToNumbers(p),
      createdAt: p.createdAt.toISOString(),
      deployedAt: p.deployedAt ? p.deployedAt.toISOString() : null,
    }));
  }

  /** Gets a single prompt version by ID */
  async getPrompt(promptId: string): Promise<PromptVersionSummary> {
    logger.info("Prompt Optimization Service", "Getting prompt version", { promptId });

    const [[prompt], allRuns] = await Promise.all([
      db.select().from(promptVersions).where(eq(promptVersions.id, promptId)),
      db.select().from(optimizationRuns).orderBy(optimizationRuns.createdAt),
    ]);

    if (!prompt) {
      throw new Error(`Prompt version ${promptId} not found`);
    }

    const runNumberMap = this.buildRunNumberMap(allRuns);

    return {
      id: prompt.id,
      version: this.computeVersionString(prompt.optimizationRunId, prompt.beamRank, runNumberMap),
      promptText: prompt.promptText,
      isActive: prompt.isActive,
      isBaseline: prompt.isBaseline,
      ...this.convertMetricsToNumbers(prompt),
      createdAt: prompt.createdAt.toISOString(),
    };
  }

  /** Gets the currently active prompt version */
  async getActivePrompt(): Promise<ActivePrompt> {
    logger.info("Prompt Optimization Service", "Getting active prompt");

    const [[prompt], allRuns] = await Promise.all([
      db.select().from(promptVersions).where(eq(promptVersions.isActive, true)),
      db.select().from(optimizationRuns).orderBy(optimizationRuns.createdAt),
    ]);

    if (!prompt) {
      throw new Error("No active prompt found");
    }

    const runNumberMap = this.buildRunNumberMap(allRuns);

    return {
      id: prompt.id,
      promptText: prompt.promptText,
      version: this.computeVersionString(prompt.optimizationRunId, prompt.beamRank, runNumberMap),
      ...this.convertMetricsToNumbers(prompt),
    };
  }

  /** Lists all optimization runs ordered by creation date */
  async listOptimizationRuns(): Promise<OptimizationRun[]> {
    logger.info("Prompt Optimization Service", "Listing optimization runs");

    const runs = await db
      .select()
      .from(optimizationRuns)
      .orderBy(desc(optimizationRuns.createdAt));

    return runs.map(r => ({
      id: r.id,
      status: r.status,
      startingPromptId: r.startingPromptId,
      bestPromptId: r.bestPromptId,
      totalIterations: r.totalIterations,
      totalPromptsGenerated: r.totalPromptsGenerated,
      improvementPercentage: r.improvementPercentage ? Number(r.improvementPercentage) : null,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    }));
  }

  /** Deploys a prompt version by setting it as active */
  async deployPrompt(promptId: string): Promise<void> {
    logger.info("Prompt Optimization Service", "Deploying prompt", { promptId });

    await db.transaction(async (tx) => {
      await tx.update(promptVersions).set({ isActive: false });
      await tx.update(promptVersions)
        .set({ isActive: true, deployedAt: new Date() })
        .where(eq(promptVersions.id, promptId));
    });

    logger.info("Prompt Optimization Service", "Prompt deployed successfully", { promptId });
  }

  /** Starts beam search optimization workflow, returns job ID */
  async startOptimization(input: StartOptimizationInput): Promise<{ jobId: string }> {
    logger.info("Prompt Optimization Service", "Starting optimization", {
      startingPromptId: input.startingPromptId,
      maxIterations: input.maxIterations,
      variantsPerIteration: input.variantsPerIteration,
      beamWidth: input.beamWidth,
    });

    const { jobId, result } = await executeOptimizationWorkflow(input);

    if (result) {
      logger.info("Prompt Optimization Service", "Sync optimization complete", {
        jobId,
        bestPromptId: result.bestPromptId,
        improvementPercentage: result.improvementPercentage,
      });
    }

    return { jobId };
  }

  /** Gets optimization job status and results when complete */
  async getOptimizationStatus(jobId: string): Promise<OptimizationStatus> {
    if (jobId.startsWith("sync-")) {
      logger.info("Prompt Optimization Service", "Returning mock completed status for sync job", {
        jobId,
      });
      return { status: TriggerRunStatus.COMPLETED, isCompleted: true, output: undefined };
    }

    logger.info("Prompt Optimization Service", "Getting optimization status from Trigger.dev", {
      jobId,
    });

    const run = await runs.retrieve(jobId);
    const isTerminalStatus = isCompletedStatus(run.status) ||
      [TriggerRunStatus.FAILED, TriggerRunStatus.CANCELED].includes(run.status as TriggerRunStatus);

    return {
      status: run.status as TriggerRunStatus,
      isCompleted: isTerminalStatus,
      output: run.output,
    };
  }

  /** Exports evaluation results as CSV for a prompt version */
  async exportEvaluationResults(promptId: string): Promise<EvaluationExport> {
    logger.info("Prompt Optimization Service", "Exporting evaluation results", { promptId });

    const [prompt] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, promptId));

    if (!prompt) {
      throw new Error(`Prompt version ${promptId} not found`);
    }

    const results = await this.fetchEvaluationResultsForExport(promptId);

    if (results.length === 0) {
      throw new Error("No evaluation results found for this prompt version");
    }

    const records = this.buildEvaluationExportRecords(results);
    const csvString = this.generateEvaluationCsv(records);
    const filename = this.generateExportFilename(prompt);

    logger.info("Prompt Optimization Service", "Evaluation results exported", {
      promptId,
      rowCount: results.length,
    });

    return { csv: csvString, filename };
  }

  /** Fetches evaluation results with lead details for export */
  private async fetchEvaluationResultsForExport(promptId: string) {
    return db
      .select({
        firstName: evaluationLeads.firstName,
        lastName: evaluationLeads.lastName,
        jobTitle: evaluationLeads.jobTitle,
        companyName: evaluationLeads.companyName,
        employeeRange: evaluationLeads.employeeRange,
        groundTruthRank: evaluationLeads.groundTruthRank,
        predictedRank: evaluationResults.predictedRank,
        absoluteError: evaluationResults.absoluteError,
        predictedReasoning: evaluationResults.predictedReasoning,
      })
      .from(evaluationResults)
      .innerJoin(evaluationLeads, eq(evaluationResults.evaluationLeadId, evaluationLeads.id))
      .where(eq(evaluationResults.promptVersionId, promptId))
      .orderBy(asc(evaluationLeads.groundTruthRank));
  }

  /** Transforms database results into export-ready records */
  private buildEvaluationExportRecords(
    results: Awaited<ReturnType<typeof this.fetchEvaluationResultsForExport>>
  ): Record<string, string | number | null>[] {
    return results.map((r) => ({
      "First Name": r.firstName,
      "Last Name": r.lastName,
      "Job Title": r.jobTitle,
      "Company": r.companyName,
      "Employee Range": r.employeeRange,
      "Ground Truth Rank": r.groundTruthRank,
      "Predicted Rank": r.predictedRank,
      "Error": r.absoluteError ? Number(r.absoluteError) : 0,
      "Reasoning": r.predictedReasoning,
    }));
  }

  /** Generates CSV string from evaluation records */
  private generateEvaluationCsv(records: Record<string, string | number | null>[]): string {
    return stringify(records, {
      header: true,
      escape_formulas: true,
      columns: [
        "First Name",
        "Last Name",
        "Job Title",
        "Company",
        "Employee Range",
        "Ground Truth Rank",
        "Predicted Rank",
        "Error",
        "Reasoning",
      ],
    });
  }

  /** Generates filename for evaluation export based on version */
  private generateExportFilename(prompt: typeof promptVersions.$inferSelect): string {
    const versionLabel = prompt.isBaseline ? "baseline" : `v${prompt.iterationNumber}.${prompt.beamRank || 1}`;
    return `evaluation-results-${versionLabel}-${new Date().toISOString().split("T")[0]}.csv`;
  }
}

export const promptOptimizationService = PromptOptimizationService.getInstance();
