import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { toast } from "sonner";

type ValidationError = {
  rowNumber: number;
  field: string;
  message: string;
  value?: string;
};

interface UseCsvUploadOptions {
  onImportStart: (jobId: string) => void;
  onUploadSuccess?: () => void;
  onClearError: () => void;
}

interface UseCsvUploadReturn {
  validationErrors: ValidationError[];
  showValidationPreview: boolean;
  isPending: boolean;
  upload: (file: File) => void;
  clearValidation: () => void;
}

export function useCsvUpload({
  onImportStart,
  onUploadSuccess,
  onClearError,
}: UseCsvUploadOptions): UseCsvUploadReturn {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [showValidationPreview, setShowValidationPreview] = useState(false);

  const uploadMutation = useMutation({
    ...orpc.csv.upload.mutationOptions(),
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        const errorSummary =
          result.validationErrors && result.validationErrors.length > 0
            ? `Found ${result.validationErrors.length} validation error(s) in ${result.totalRows || 0} rows`
            : "CSV validation failed. Please fix the errors and try again.";

        setValidationErrors(result.validationErrors || []);
        setShowValidationPreview(true);
        toast.error(errorSummary);
      } else if (result.importJobId) {
        onImportStart(result.importJobId);
        setShowValidationPreview(false);
        toast.success("CSV validated successfully", {
          description: "Import in progress...",
        });
        onUploadSuccess?.();
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const upload = useCallback(
    (file: File) => {
      onClearError();
      uploadMutation.mutate({ file });
    },
    [onClearError, uploadMutation]
  );

  const clearValidation = useCallback(() => {
    setValidationErrors([]);
    setShowValidationPreview(false);
  }, []);

  return {
    validationErrors,
    showValidationPreview,
    isPending: uploadMutation.isPending,
    upload,
    clearValidation,
  };
}
