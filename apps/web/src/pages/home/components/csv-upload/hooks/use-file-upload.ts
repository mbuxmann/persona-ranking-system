import { useState, useRef, useCallback } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { toast } from "sonner";

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface FileUploadState {
  file: File | null;
  preview: string[][];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

interface FileUploadActions {
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>, disabled?: boolean) => void;
  triggerFileInput: () => void;
  clear: () => void;
}

export function useFileUpload(): FileUploadState & FileUploadActions {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);

  const processFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".csv")) {
      toast.error("Invalid file type", {
        description: "Please select a CSV file",
      });
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File too large", {
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB`,
      });
      return;
    }

    setFile(selectedFile);

    try {
      const content = await selectedFile.text();
      const lines = content.split("\n").filter((line) => line.trim());
      const previewRows = lines.slice(0, 6).map((line) => {
        return line.split(",").map((cell) => cell.trim());
      });
      setPreview(previewRows);
    } catch (error) {
      toast.error("Failed to read file");
      console.error(error);
    }
  }, []);

  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;
      await processFile(selectedFile);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, disabled = false) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      const droppedFile = e.dataTransfer.files?.[0];
      if (!droppedFile) return;
      processFile(droppedFile);
    },
    [processFile]
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setPreview([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return {
    file,
    preview,
    fileInputRef,
    handleFileSelect,
    handleDragOver,
    handleDrop,
    triggerFileInput,
    clear,
  };
}
