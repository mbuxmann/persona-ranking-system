import { useAtomValue } from "jotai";
import { hasActiveUploadsAtom } from "./csv-upload/atoms";
import { Card } from "@/components/ui/card";

export function UploadStatusBanner() {
  const hasActiveUploads = useAtomValue(hasActiveUploadsAtom);

  if (!hasActiveUploads) return null;

  return (
    <Card className="mb-6 bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Processing Leads</h3>
        <span className="text-xs text-muted-foreground">
          Import or ranking in progress...
        </span>
      </div>
    </Card>
  );
}
