export enum TriggerRunStatus {
  QUEUED = "QUEUED",
  EXECUTING = "EXECUTING",
  WAITING = "WAITING",
  DELAYED = "DELAYED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CRASHED = "CRASHED",
  SYSTEM_FAILURE = "SYSTEM_FAILURE",
  CANCELED = "CANCELED",
  TIMED_OUT = "TIMED_OUT",
  PENDING_VERSION = "PENDING_VERSION",
  DEQUEUED = "DEQUEUED",
  EXPIRED = "EXPIRED",
}

export const isFailedStatus = (status: string): boolean => {
  return [
    TriggerRunStatus.FAILED,
    TriggerRunStatus.CRASHED,
    TriggerRunStatus.SYSTEM_FAILURE,
  ].includes(status as TriggerRunStatus);
};

export const isCompletedStatus = (status: string): boolean => {
  return status === TriggerRunStatus.COMPLETED;
};
