import { atom } from "jotai";
import { atomWithQuery } from "jotai-tanstack-query";
import { toast } from "sonner";
import { client, queryClient, orpc } from "@/utils/orpc";
import type { UploadStage } from "../types";

// ============================================
// BASE ATOMS - primitive state
// ============================================

export const importJobIdAtom = atom<string | null>(null);
export const rankingJobIdAtom = atom<string | null>(null);
export const lastErrorAtom = atom<string | null>(null);

// Track which completions we've handled to prevent duplicate side effects
const handledCompletionsAtom = atom<{
  import: string | null;
  ranking: string | null;
}>({ import: null, ranking: null });

// ============================================
// QUERY ATOMS - derived from job IDs
// ============================================

export const activeUploadsAtom = atomWithQuery(() => ({
  queryKey: ["csv", "hasActiveUploads"],
  queryFn: () => client.csv.hasActiveUploads({}),
  refetchInterval: 2000,
}));

export const importStatusAtom = atomWithQuery((get) => {
  const jobId = get(importJobIdAtom);
  return {
    queryKey: ["csv", "importStatus", jobId],
    queryFn: () => client.csv.importStatus({ jobId: jobId! }),
    enabled: !!jobId,
    refetchInterval: 2000,
  };
});

export const rankingStatusAtom = atomWithQuery((get) => {
  const jobId = get(rankingJobIdAtom);
  return {
    queryKey: ["ranking", "status", jobId],
    queryFn: () => client.ranking.status({ jobId: jobId! }),
    enabled: !!jobId,
    refetchInterval: 2000,
  };
});

// ============================================
// DERIVED ATOMS - computed from queries
// ============================================

export const uploadStageAtom = atom<UploadStage>((get) => {
  const importJobId = get(importJobIdAtom);
  const rankingJobId = get(rankingJobIdAtom);
  const importStatus = get(importStatusAtom);
  const rankingStatus = get(rankingStatusAtom);

  // Ranking completed or failed -> completed
  if (rankingStatus.data?.isCompleted || rankingStatus.data?.isFailed) {
    return "completed";
  }

  // Actively ranking
  if (rankingJobId) {
    return "ranking";
  }

  // Import completed, transitioning to ranking
  if (importStatus.data?.isCompleted) {
    return "ranking";
  }

  // Actively importing
  if (importJobId) {
    return "importing";
  }

  return "validating";
});

export const hasActiveUploadsAtom = atom((get) => {
  const activeUploads = get(activeUploadsAtom);
  return activeUploads.data?.hasActive || false;
});

export const isProcessingAtom = atom((get) => {
  const importJobId = get(importJobIdAtom);
  const rankingJobId = get(rankingJobIdAtom);
  return !!importJobId || !!rankingJobId;
});

// ============================================
// WRITE ATOMS - handle transitions & side effects
// ============================================

// Check and handle import completion
export const checkImportCompleteAtom = atom(null, (get, set) => {
  const importStatus = get(importStatusAtom);
  const importJobId = get(importJobIdAtom);
  const handled = get(handledCompletionsAtom);

  // Already handled this completion
  if (!importJobId || handled.import === importJobId) return false;

  if (importStatus.data?.isCompleted) {
    // Mark as handled
    set(handledCompletionsAtom, { ...handled, import: importJobId });

    const output = importStatus.data.output as {
      rankingJobId?: string;
      leadsAdded?: number;
      companiesAdded?: number;
      leadsSkipped?: number;
    } | undefined;

    // Clear import job
    set(importJobIdAtom, null);

    if (output?.rankingJobId) {
      // Start ranking phase
      set(rankingJobIdAtom, output.rankingJobId);
    } else {
      // No ranking needed
      toast.success("Import complete", {
        description: `${output?.leadsAdded || 0} leads from ${output?.companiesAdded || 0} companies (${output?.leadsSkipped || 0} duplicates skipped)`,
      });
    }
    return true;
  }

  if (importStatus.data?.isFailed) {
    set(handledCompletionsAtom, { ...handled, import: importJobId });
    set(importJobIdAtom, null);
    set(lastErrorAtom, "Import failed. Database transaction rolled back.");
    return true;
  }

  return false;
});

// Check and handle ranking completion
export const checkRankingCompleteAtom = atom(null, (get, set) => {
  const rankingStatus = get(rankingStatusAtom);
  const rankingJobId = get(rankingJobIdAtom);
  const handled = get(handledCompletionsAtom);

  // Already handled this completion
  if (!rankingJobId || handled.ranking === rankingJobId) return false;

  if (rankingStatus.data?.isCompleted) {
    // Mark as handled
    set(handledCompletionsAtom, { ...handled, ranking: rankingJobId });

    const output = rankingStatus.data.output as
      | { rankedCount?: number }
      | undefined;

    set(rankingJobIdAtom, null);
    toast.success("Upload complete!", {
      description: `Ranked ${output?.rankedCount || 0} leads successfully`,
    });

    // Invalidate leads list to refresh data
    queryClient.invalidateQueries({ queryKey: orpc.leads.list.queryKey() });
    return true;
  }

  if (rankingStatus.data?.isFailed) {
    set(handledCompletionsAtom, { ...handled, ranking: rankingJobId });
    set(rankingJobIdAtom, null);
    set(lastErrorAtom, "Ranking failed. Leads were imported but not ranked.");
    return true;
  }

  return false;
});

// Action atoms
export const startImportAtom = atom(null, (_get, set, jobId: string) => {
  set(importJobIdAtom, jobId);
});

export const resetAtom = atom(null, (_get, set) => {
  set(importJobIdAtom, null);
  set(rankingJobIdAtom, null);
  set(lastErrorAtom, null);
  set(handledCompletionsAtom, { import: null, ranking: null });
});

export const clearErrorAtom = atom(null, (_get, set) => {
  set(lastErrorAtom, null);
});
