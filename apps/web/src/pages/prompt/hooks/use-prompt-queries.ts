import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export function usePromptQueries() {
  const {
    data: prompts = [],
    refetch: refetchPrompts,
    isLoading: isLoadingPrompts,
  } = useQuery(orpc.promptOptimization.listPrompts.queryOptions());

  const { data: activePrompt, isLoading: isLoadingActive } = useQuery(
    orpc.promptOptimization.getActivePrompt.queryOptions()
  );

  const { data: optimizationRuns = [], isLoading: isLoadingRuns } = useQuery(
    orpc.promptOptimization.listOptimizationRuns.queryOptions()
  );

  return {
    prompts,
    activePrompt,
    optimizationRuns,
    refetchPrompts,
    isLoading: isLoadingPrompts || isLoadingActive || isLoadingRuns,
  };
}
