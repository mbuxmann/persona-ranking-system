import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FilePreviewProps {
  file: File;
  preview: string[][];
  isBlocked: boolean;
  showValidationPreview: boolean;
  onUpload: () => void;
  onClear: () => void;
}

export function FilePreview({
  file,
  preview,
  isBlocked,
  showValidationPreview,
  onUpload,
  onClear,
}: FilePreviewProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Selected:</span>
        <Badge variant="secondary">{file.name}</Badge>
        <Badge variant="outline">{(file.size / 1024).toFixed(1)} KB</Badge>
      </div>

      {preview.length > 0 && !showValidationPreview && !isBlocked && (
        <div>
          <p className="mb-2 text-sm font-medium">Preview (first 5 rows):</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview[0]?.map((header, i) => (
                    <TableHead key={i}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(1).map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!showValidationPreview && !isBlocked && (
        <div className="flex gap-2">
          <Button onClick={onUpload} className="flex-1">
            Upload & Import
          </Button>
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
