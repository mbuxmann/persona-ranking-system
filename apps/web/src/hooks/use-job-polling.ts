import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

interface JobStatus {
  isCompleted?: boolean;
  isFailed?: boolean;
}

interface UseJobPollingOptions<TData extends JobStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryOptions: (jobId: string) => any;
  pollingInterval?: number;
  onComplete?: (data: TData) => void;
  onFailed?: (data: TData) => void;
}

interface UseJobPollingResult<TData extends JobStatus> {
  jobId: string | null;
  data: TData | undefined;
  isPolling: boolean;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
}

export function useJobPolling<TData extends JobStatus>({
  queryOptions,
  pollingInterval = 2000,
  onComplete,
  onFailed,
}: UseJobPollingOptions<TData>): UseJobPollingResult<TData> {
  const [jobId, setJobId] = useState<string | null>(null);

  const { data } = useQuery({
    ...queryOptions(jobId!),
    enabled: !!jobId,
    refetchInterval: (query: { state: { data: TData | undefined } }) => {
      const queryData = query.state.data;
      if (queryData?.isCompleted || queryData?.isFailed) {
        return false;
      }
      return pollingInterval;
    },
  }) as { data: TData | undefined };

  useEffect(() => {
    if (!data) return;

    if (data.isCompleted) {
      onComplete?.(data);
      setJobId(null);
    } else if (data.isFailed) {
      onFailed?.(data);
      setJobId(null);
    }
  }, [data, onComplete, onFailed]);

  const startPolling = useCallback((newJobId: string) => {
    setJobId(newJobId);
  }, []);

  const stopPolling = useCallback(() => {
    setJobId(null);
  }, []);

  return {
    jobId,
    data,
    isPolling: !!jobId,
    startPolling,
    stopPolling,
  };
}
