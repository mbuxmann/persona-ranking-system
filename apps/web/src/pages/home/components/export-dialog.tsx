import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useExportLeads } from "../hooks";

interface ExportDialogProps {
  disabled: boolean;
}

export function ExportDialog({ disabled }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [topN, setTopN] = useState(3);

  const { exportLeads, isExporting } = useExportLeads({
    onSuccess: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Export CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Top Leads</DialogTitle>
          <DialogDescription>
            Export the top N leads per company to a CSV file
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="topN" className="w-40 text-right">
              Top N per company:
            </Label>
            <Input
              id="topN"
              type="number"
              min="1"
              max="100"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value) || 3)}
              className="w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => exportLeads(topN)} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
