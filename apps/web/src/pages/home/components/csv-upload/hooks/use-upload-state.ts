import { useAtomValue, useSetAtom } from "jotai";
import {
  importJobIdAtom,
  rankingJobIdAtom,
  lastErrorAtom,
  uploadStageAtom,
  hasActiveUploadsAtom,
  isProcessingAtom,
  checkImportCompleteAtom,
  checkRankingCompleteAtom,
  startImportAtom,
  resetAtom,
  clearErrorAtom,
} from "../atoms";
import type { UploadStage } from "../types";

interface UploadState {
  importJobId: string | null;
  rankingJobId: string | null;
  uploadStage: UploadStage;
  lastError: string | null;
  hasActiveUploads: boolean;
  isProcessing: boolean;
}

interface UploadStateActions {
  startImport: (jobId: string) => void;
  reset: () => void;
  clearError: () => void;
}

export function useUploadState(): UploadState & UploadStateActions {
  // Read base atoms
  const importJobId = useAtomValue(importJobIdAtom);
  const rankingJobId = useAtomValue(rankingJobIdAtom);
  const lastError = useAtomValue(lastErrorAtom);

  // Read derived atoms
  const uploadStage = useAtomValue(uploadStageAtom);
  const hasActiveUploads = useAtomValue(hasActiveUploadsAtom);
  const isProcessing = useAtomValue(isProcessingAtom);

  // Get action dispatchers
  const checkImportComplete = useSetAtom(checkImportCompleteAtom);
  const checkRankingComplete = useSetAtom(checkRankingCompleteAtom);
  const startImport = useSetAtom(startImportAtom);
  const reset = useSetAtom(resetAtom);
  const clearError = useSetAtom(clearErrorAtom);

  // Check for completions on each render (idempotent - tracked by handledCompletionsAtom)
  checkImportComplete();
  checkRankingComplete();

  return {
    importJobId,
    rankingJobId,
    uploadStage,
    lastError,
    hasActiveUploads,
    isProcessing,
    startImport,
    reset,
    clearError,
  };
}
