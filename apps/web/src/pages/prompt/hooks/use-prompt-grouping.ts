import { useMemo, useState, useCallback } from "react";
import type { PromptData, OptimizationRun } from "../types";

interface UsePromptGroupingResult {
  baselinePrompt: PromptData | undefined;
  sortedRunIds: string[];
  getRunPrompts: (runId: string) => PromptData[];
  getRunMetadata: (runId: string) => OptimizationRun | undefined;
  getRunNumber: (runId: string) => number;
  latestRunId: string | undefined;
  isRunExpanded: (runId: string) => boolean;
  toggleRun: (runId: string) => void;
}

export function usePromptGrouping(
  prompts: PromptData[],
  optimizationRuns: OptimizationRun[]
): UsePromptGroupingResult {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const { baselinePrompt, groupedRuns, sortedRunIds, runMetadata } =
    useMemo(() => {
      const baseline = prompts.find((p) => !p.optimizationRunId);
      const runPrompts = prompts.filter((p) => p.optimizationRunId);

      const grouped = runPrompts.reduce(
        (acc, prompt) => {
          const runId = prompt.optimizationRunId!;
          if (!acc.has(runId)) {
            acc.set(runId, []);
          }
          acc.get(runId)!.push(prompt);
          return acc;
        },
        new Map<string, PromptData[]>()
      );

      const metadata = new Map(optimizationRuns.map((r) => [r.id, r]));

      const sorted = Array.from(grouped.keys()).sort((a, b) => {
        const runA = metadata.get(a);
        const runB = metadata.get(b);
        if (!runA || !runB) return 0;
        return (
          new Date(runB.createdAt).getTime() -
          new Date(runA.createdAt).getTime()
        );
      });

      return {
        baselinePrompt: baseline,
        groupedRuns: grouped,
        sortedRunIds: sorted,
        runMetadata: metadata,
      };
    }, [prompts, optimizationRuns]);

  const latestRunId = sortedRunIds[0];

  const getRunPrompts = useCallback(
    (runId: string) => {
      const runPromptsList = groupedRuns.get(runId) || [];
      return [...runPromptsList].sort(
        (a, b) => (a.beamRank || 99) - (b.beamRank || 99)
      );
    },
    [groupedRuns]
  );

  const getRunMetadata = useCallback(
    (runId: string) => runMetadata.get(runId),
    [runMetadata]
  );

  const getRunNumber = useCallback(
    (runId: string) => sortedRunIds.length - sortedRunIds.indexOf(runId),
    [sortedRunIds]
  );

  const isRunExpanded = useCallback(
    (runId: string) =>
      expandedRunId === null ? runId === latestRunId : expandedRunId === runId,
    [expandedRunId, latestRunId]
  );

  const toggleRun = useCallback(
    (runId: string) => {
      setExpandedRunId((current) => {
        const isCurrentlyExpanded =
          current === null ? runId === latestRunId : current === runId;
        return isCurrentlyExpanded ? "" : runId;
      });
    },
    [latestRunId]
  );

  return {
    baselinePrompt,
    sortedRunIds,
    getRunPrompts,
    getRunMetadata,
    getRunNumber,
    latestRunId,
    isRunExpanded,
    toggleRun,
  };
}
