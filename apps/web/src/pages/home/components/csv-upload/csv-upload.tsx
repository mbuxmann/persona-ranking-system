import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Upload } from "lucide-react";
import { useCsvUpload, useFileUpload, useUploadState } from "./hooks";
import { FileDropZone, FilePreview, UploadError } from "./components";

interface CSVUploadProps {
  onUploadSuccess?: () => void;
}

export function CSVUpload({ onUploadSuccess }: CSVUploadProps) {
  const {
    file,
    preview,
    fileInputRef,
    handleFileSelect,
    handleDragOver,
    handleDrop,
    triggerFileInput,
    clear: clearFile,
  } = useFileUpload();

  const {
    lastError,
    hasActiveUploads,
    isProcessing,
    startImport,
    reset: resetJobState,
    clearError,
  } = useUploadState();

  const {
    validationErrors,
    showValidationPreview,
    isPending,
    upload,
    clearValidation,
  } = useCsvUpload({
    onImportStart: startImport,
    onUploadSuccess,
    onClearError: clearError,
  });

  const handleUpload = () => {
    if (!file) return;
    upload(file);
  };

  const handleClear = () => {
    clearFile();
    clearValidation();
    resetJobState();
  };

  const handleRetry = () => {
    clearError();
    if (file) handleUpload();
  };

  const isBlocked = isProcessing || hasActiveUploads || isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropZone
            fileInputRef={fileInputRef}
            disabled={isBlocked}
            hasFile={!!file}
            hasActiveUploads={hasActiveUploads}
            isProcessing={isProcessing}
            onFileSelect={handleFileSelect}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, isBlocked)}
            onTriggerInput={triggerFileInput}
          />

          {file && (
            <FilePreview
              file={file}
              preview={preview}
              isBlocked={isBlocked}
              showValidationPreview={showValidationPreview}
              onUpload={handleUpload}
              onClear={handleClear}
            />
          )}

          {!file && !isBlocked && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Select a CSV file to upload. The file will be validated before
                importing.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {showValidationPreview && validationErrors.length > 0 && (
        <UploadError
          error="CSV validation failed"
          validationErrors={validationErrors}
          type="validation"
          onRetry={handleRetry}
        />
      )}

      {lastError && !showValidationPreview && (
        <UploadError
          error={lastError}
          type="import"
          onRetry={handleRetry}
          retryDisabled={!file}
        />
      )}
    </div>
  );
}
