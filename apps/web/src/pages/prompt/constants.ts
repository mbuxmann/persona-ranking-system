// Ordered by comparison priority: Kendall > Spearman > MAE > RMSE
export const METRIC_INFO = {
  kendall: {
    name: "Kendall",
    desc: "When comparing any two leads, does the AI pick the better one?",
    better: "higher" as const,
    example:
      "If John is better than Sarah, does the AI rank John higher? 0.7 means the AI gets this right about 85% of the time.",
  },
  spearman: {
    name: "Spearman",
    desc: "Does the AI put leads in the right order?",
    better: "higher" as const,
    example:
      "If the best leads should be John, Sarah, Mike - and the AI says John, Mike, Sarah - that's close but not perfect. 1.0 = perfect order, 0 = random order.",
  },
  mae: {
    name: "MAE",
    desc: "How far off are the predictions on average?",
    better: "lower" as const,
    example:
      "If the AI says a lead should be #5 but they're actually #3, that's 2 spots off. MAE of 1.5 means predictions are usually about 1-2 spots away from the real rank.",
  },
  rmse: {
    name: "RMSE",
    desc: "Like MAE, but big mistakes count more.",
    better: "lower" as const,
    example:
      "Being 10 spots off on one lead is worse than being 2 spots off on five leads. RMSE catches when the AI makes occasional big mistakes.",
  },
} as const;

export type MetricKey = keyof typeof METRIC_INFO;
