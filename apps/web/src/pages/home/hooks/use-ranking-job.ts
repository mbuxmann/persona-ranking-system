import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc, queryClient } from "@/utils/orpc";
import { toast } from "sonner";
import { useJobPolling } from "@/hooks";

type RankingStatus = {
  isCompleted: boolean;
  isFailed: boolean;
  output?: { rankedCount?: number };
};

export function useRankingJob() {
  const { isPolling, startPolling } = useJobPolling<RankingStatus>({
    queryOptions: (jobId) =>
      orpc.ranking.status.queryOptions({ input: { jobId } }),
    pollingInterval: 2000,
    onComplete: useCallback((data: RankingStatus) => {
      toast.success("Ranking complete!", {
        description: `Ranked ${data.output?.rankedCount || 0} leads`,
      });
      queryClient.invalidateQueries({ queryKey: orpc.leads.list.queryKey() });
    }, []),
    onFailed: useCallback(() => {
      toast.error("Ranking failed", {
        description: "Please try again",
      });
    }, []),
  });

  const rankLeadsMutation = useMutation({
    ...orpc.ranking.rankAllLeads.mutationOptions(),
    onSuccess: (result) => {
      toast.success("Ranking job started", {
        description: "Processing all leads in the background...",
      });
      startPolling(result.jobId);
    },
    onError: (error: Error) => {
      toast.error(`Failed to start ranking: ${error.message}`);
    },
  });

  return {
    isRanking: isPolling,
    isStarting: rankLeadsMutation.isPending,
    startRanking: () => rankLeadsMutation.mutate({}),
  };
}
