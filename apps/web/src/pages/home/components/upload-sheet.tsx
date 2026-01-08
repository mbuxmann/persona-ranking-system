import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CSVUpload } from "./csv-upload";

interface UploadSheetProps {
  disabled: boolean;
}

export function UploadSheet({ disabled }: UploadSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Upload CSV
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Upload CSV</SheetTitle>
          <SheetDescription>
            Upload a CSV file with lead data to import into the system
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <CSVUpload onUploadSuccess={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
