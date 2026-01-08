import { useCallback } from "react";
import { orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useJobPolling } from "@/hooks";

type OptimizationStatus = {
  isCompleted: boolean;
  status: string;
};

interface UseOptimizationPollingOptions {
  onComplete?: () => void;
}

export function useOptimizationPolling({
  onComplete,
}: UseOptimizationPollingOptions = {}) {
  const { jobId, data: status, isPolling, startPolling } = useJobPolling<OptimizationStatus>({
    queryOptions: (jobId) =>
      orpc.promptOptimization.getOptimizationStatus.queryOptions({
        input: { jobId },
      }),
    pollingInterval: 5000,
    onComplete: useCallback(
      (data: OptimizationStatus) => {
        onComplete?.();
        if (data.status === "COMPLETED") {
          toast.success("Optimization completed!", {
            description: "New prompt variants have been generated and evaluated.",
          });
        } else if (data.status === "FAILED") {
          toast.error("Optimization failed", {
            description: "Check the logs for more details.",
          });
        }
      },
      [onComplete]
    ),
  });

  return {
    jobId,
    status,
    isOptimizing: isPolling,
    startPolling,
  };
}
