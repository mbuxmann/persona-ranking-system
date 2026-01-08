import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { PromptCard } from "./prompt-card";
import { RunSection } from "./run-section";
import { usePromptGrouping } from "../hooks";
import type { PromptData, OptimizationRun } from "../types";

interface PromptVersionsListProps {
  prompts: PromptData[];
  optimizationRuns: OptimizationRun[];
  expandedPromptIds: Set<string>;
  onTogglePromptExpand: (id: string) => void;
  onDeploy: (promptId: string) => void;
  onExport: (promptId: string) => void;
  isDeploying: boolean;
  isExporting: boolean;
}

export function PromptVersionsList({
  prompts,
  optimizationRuns,
  expandedPromptIds,
  onTogglePromptExpand,
  onDeploy,
  onExport,
  isDeploying,
  isExporting,
}: PromptVersionsListProps) {
  const {
    baselinePrompt,
    sortedRunIds,
    getRunPrompts,
    getRunMetadata,
    getRunNumber,
    isRunExpanded,
    toggleRun,
  } = usePromptGrouping(prompts, optimizationRuns);

  if (prompts.length === 0) {
    return (
      <Card className="flex flex-col overflow-hidden min-h-0">
        <CardHeader>
          <CardTitle>Prompt Versions</CardTitle>
          <CardDescription>
            History of all prompt versions grouped by optimization run
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          <p className="text-sm text-muted-foreground text-center py-8">
            No prompt versions found
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden min-h-0">
      <CardHeader>
        <CardTitle>Prompt Versions</CardTitle>
        <CardDescription>
          History of all prompt versions grouped by optimization run
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <div className="space-y-4">
          {sortedRunIds.map((runId) => (
            <RunSection
              key={runId}
              runId={runId}
              runNumber={getRunNumber(runId)}
              prompts={getRunPrompts(runId)}
              metadata={getRunMetadata(runId)}
              isExpanded={isRunExpanded(runId)}
              onToggle={() => toggleRun(runId)}
              expandedPromptIds={expandedPromptIds}
              onTogglePromptExpand={onTogglePromptExpand}
              onDeploy={onDeploy}
              onExport={onExport}
              isDeploying={isDeploying}
              isExporting={isExporting}
            />
          ))}

          {baselinePrompt && (
            <div className="border rounded-lg overflow-hidden">
              <div className="p-4 bg-muted/50">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Baseline</span>
                  {baselinePrompt.isActive && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-4 border-t">
                <PromptCard
                  prompt={baselinePrompt}
                  isBaseline={true}
                  expandedPromptIds={expandedPromptIds}
                  onToggleExpand={onTogglePromptExpand}
                  onDeploy={onDeploy}
                  onExport={onExport}
                  isDeploying={isDeploying}
                  isExporting={isExporting}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
