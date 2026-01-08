import type { ChangeEvent, DragEvent, RefObject } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  hasFile: boolean;
  hasActiveUploads: boolean;
  isProcessing: boolean;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onTriggerInput: () => void;
}

export function FileDropZone({
  fileInputRef,
  disabled,
  hasFile,
  hasActiveUploads,
  isProcessing,
  onFileSelect,
  onDragOver,
  onDrop,
  onTriggerInput,
}: FileDropZoneProps) {
  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={onFileSelect}
        disabled={disabled}
        className="hidden"
      />

      <div
        onClick={() => !disabled && onTriggerInput()}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "hover:border-primary hover:bg-muted/50",
          hasFile ? "border-muted" : "border-muted-foreground/25"
        )}
      >
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm font-medium mb-1">
          {hasActiveUploads && !isProcessing
            ? "Upload in progress..."
            : "Click to browse or drag and drop"}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasActiveUploads && !isProcessing
            ? "Please wait for the current upload to complete"
            : "CSV files up to 5MB"}
        </p>
      </div>
    </div>
  );
}
