import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export function useHomeQueries() {
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery(
    orpc.leads.list.queryOptions()
  );

  const { data: activeUploadsCheck } = useQuery({
    ...orpc.csv.hasActiveUploads.queryOptions(),
    refetchInterval: 3000,
  });

  const hasActiveUploads = activeUploadsCheck?.hasActive || false;

  const rankedCount = leads.filter(
    (lead: { companyRank: number | null }) => lead.companyRank !== null
  ).length;

  return {
    leads,
    isLoadingLeads,
    hasActiveUploads,
    rankedCount,
  };
}
