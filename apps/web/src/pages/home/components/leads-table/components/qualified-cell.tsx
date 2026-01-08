import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle, XCircle, Clock } from "lucide-react";

interface StatusIconProps {
  icon: LucideIcon;
  className: string;
  label: string;
}

function StatusIcon({ icon: Icon, className, label }: StatusIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex justify-center cursor-help">
          <Icon className={`h-4 w-4 ${className}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-sm">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface QualifiedCellProps {
  qualified: boolean | null;
}

export const QualifiedCell = memo(function QualifiedCell({
  qualified,
}: QualifiedCellProps) {
  if (qualified === null) {
    return (
      <StatusIcon icon={Clock} className="text-muted-foreground" label="Pending" />
    );
  }

  if (qualified === false) {
    return (
      <StatusIcon icon={XCircle} className="text-red-600" label="Disqualified" />
    );
  }

  return (
    <StatusIcon icon={CheckCircle} className="text-green-600" label="Qualified" />
  );
});
