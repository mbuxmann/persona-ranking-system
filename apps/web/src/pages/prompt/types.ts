export type PromptData = {
  id: string;
  version: string;
  isActive: boolean;
  isBaseline: boolean;
  beamRank: number | null;
  mae: number | null;
  rmse: number | null;
  spearmanCorrelation: number | null;
  kendallTau: number | null;
  createdAt: string;
  deployedAt: string | null;
  promptText: string;
  optimizationRunId?: string | null;
};

export type OptimizationRun = {
  id: string;
  createdAt: string;
  totalIterations: number | null;
};

export type OptimizationStatus = {
  status: string;
  isCompleted: boolean;
};
