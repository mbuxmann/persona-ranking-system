export interface EvaluationMetrics {
  mae: number;
  rmse: number;
  spearmanCorrelation: number;
  kendallTau: number;
}

export interface SampleError {
  predicted: number;
  groundTruth: number;
  reasoning: string;
  leadInfo: string;
}
