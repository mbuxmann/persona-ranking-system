import type { EvaluationMetrics } from "./evaluation";

export interface BeamCandidate extends EvaluationMetrics {
  id: string;
  promptText: string;
}

export interface OptimizationConfig {
  maxIterations: number;
  variantsPerIteration: number;
  beamWidth: number;
}

export interface PromptCandidate {
  promptText: string;
  mae: number;
  rmse: number;
  spearmanCorrelation: number;
  kendallTau: number;
}
