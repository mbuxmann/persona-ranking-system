import { memo } from "react";
import { MessageSquare } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface ReasoningCellProps {
  qualificationReasoning: string | null;
  rankingReasoning: string | null;
}

export const ReasoningCell = memo(function ReasoningCell({
  qualificationReasoning,
  rankingReasoning,
}: ReasoningCellProps) {
  const hasReasoning = qualificationReasoning || rankingReasoning;

  if (!hasReasoning) {
    return (
      <div className="flex justify-center">
        <MessageSquare className="h-4 w-4 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button className="flex justify-center w-full hover:opacity-70 transition-opacity">
          <MessageSquare className="h-4 w-4 text-muted-foreground cursor-help" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-96" side="left" align="start">
        <div className="space-y-3">
          {qualificationReasoning && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Qualification</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {qualificationReasoning}
              </p>
            </div>
          )}
          {rankingReasoning && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Ranking</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {rankingReasoning}
              </p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
