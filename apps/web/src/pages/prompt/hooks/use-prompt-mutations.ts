import { useMutation } from "@tanstack/react-query";
import { orpc, queryClient } from "@/utils/orpc";
import { toast } from "sonner";

interface UsePromptMutationsOptions {
  onOptimizationStart?: (jobId: string) => void;
}

export function usePromptMutations({
  onOptimizationStart,
}: UsePromptMutationsOptions = {}) {
  const startOptimization = useMutation({
    ...orpc.promptOptimization.startOptimization.mutationOptions(),
    onSuccess: (data) => {
      onOptimizationStart?.(data.jobId);
      toast.success("Optimization started", {
        description: `Job ID: ${data.jobId}`,
      });
    },
    onError: (error) => {
      toast.error("Failed to start optimization", {
        description: error.message,
      });
    },
  });

  const deployPrompt = useMutation({
    ...orpc.promptOptimization.deployPrompt.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.promptOptimization.listPrompts.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: orpc.promptOptimization.getActivePrompt.queryKey(),
      });
      toast.success("Prompt deployed successfully");
    },
    onError: (error) => {
      toast.error("Failed to deploy prompt", {
        description: error.message,
      });
    },
  });

  const exportResults = useMutation({
    ...orpc.promptOptimization.exportEvaluationResults.mutationOptions(),
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Results exported");
    },
    onError: (error) => {
      toast.error("Failed to export results", {
        description: error.message,
      });
    },
  });

  return {
    startOptimization,
    deployPrompt,
    exportResults,
  };
}
