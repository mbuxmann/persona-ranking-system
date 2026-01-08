import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { METRIC_INFO, type MetricKey } from "../constants";

interface MetricLabelProps {
  metric: MetricKey;
}

export function MetricLabel({ metric }: MetricLabelProps) {
  const info = METRIC_INFO[metric];
  return (
    <Tooltip>
      <TooltipTrigger className="text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
        {info.name}:
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        <p className="font-medium">{info.desc}</p>
        <p className="text-xs mt-2 text-muted-foreground">{info.example}</p>
        <p className="text-xs mt-2 font-medium">
          {info.better === "lower" ? "↓ Lower is better" : "↑ Higher is better"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
