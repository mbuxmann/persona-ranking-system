interface DownloadFileOptions {
  content: string;
  filename: string;
  mimeType?: string;
}

export function downloadFile({
  content,
  filename,
  mimeType = "text/csv",
}: DownloadFileOptions): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
