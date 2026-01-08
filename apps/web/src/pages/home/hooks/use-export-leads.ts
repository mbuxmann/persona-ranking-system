import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { downloadFile } from "@/lib/download";

interface UseExportLeadsOptions {
  onSuccess?: () => void;
}

export function useExportLeads({ onSuccess }: UseExportLeadsOptions = {}) {
  const exportMutation = useMutation({
    ...orpc.leads.export.mutationOptions(),
    onSuccess: (csvData, variables) => {
      downloadFile({
        content: csvData,
        filename: `top-${variables.topN}-leads-per-company-${new Date().toISOString().split("T")[0]}.csv`,
      });

      toast.success(
        `Successfully exported top ${variables.topN} leads per company!`
      );
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to export leads: ${error.message}`);
    },
  });

  return {
    exportLeads: (topN: number) => exportMutation.mutate({ topN }),
    isExporting: exportMutation.isPending,
  };
}
