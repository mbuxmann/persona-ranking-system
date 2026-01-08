import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface OptimizationStatusBannerProps {
  jobId: string;
  status: string | undefined;
}

export function OptimizationStatusBanner({
  jobId,
  status,
}: OptimizationStatusBannerProps) {
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin " />
          <div className="flex-1">
            <p className="font-semibold ">Optimization in progress</p>
            <p className="text-sm ">
              Job ID: {jobId} • Status: {status || "PENDING"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
