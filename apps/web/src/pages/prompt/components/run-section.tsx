import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { PromptCard } from "./prompt-card";
import type { PromptData, OptimizationRun } from "../types";

interface RunSectionProps {
  runId: string;
  runNumber: number;
  prompts: PromptData[];
  metadata: OptimizationRun | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  expandedPromptIds: Set<string>;
  onTogglePromptExpand: (id: string) => void;
  onDeploy: (promptId: string) => void;
  onExport: (promptId: string) => void;
  isDeploying: boolean;
  isExporting: boolean;
}

export function RunSection({
  runNumber,
  prompts,
  metadata,
  isExpanded,
  onToggle,
  expandedPromptIds,
  onTogglePromptExpand,
  onDeploy,
  onExport,
  isDeploying,
  isExporting,
}: RunSectionProps) {
  const bestPrompt = prompts[0];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold">Run {runNumber}</span>
          {metadata && (
            <span className="text-sm text-muted-foreground">
              {new Date(metadata.createdAt).toLocaleDateString()} •{" "}
              {metadata.totalIterations || 0} iterations
            </span>
          )}
          {bestPrompt?.isActive && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {prompts.length} variant{prompts.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {bestPrompt?.mae !== null && (
            <span className="text-sm text-muted-foreground">
              Best: MAE {bestPrompt.mae?.toFixed(2)}, Kendall{" "}
              {bestPrompt.kendallTau?.toFixed(3)}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3 border-t">
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              isBaseline={false}
              expandedPromptIds={expandedPromptIds}
              onToggleExpand={onTogglePromptExpand}
              onDeploy={onDeploy}
              onExport={onExport}
              isDeploying={isDeploying}
              isExporting={isExporting}
            />
          ))}
        </div>
      )}
    </div>
  );
}
