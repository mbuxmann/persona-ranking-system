import { useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  MetricLabel,
  OptimizationDialog,
  OptimizationStatusBanner,
  PromptVersionsList,
} from "./components";
import {
  usePromptQueries,
  usePromptMutations,
  useOptimizationPolling,
} from "./hooks";

export function PromptsPage() {
  const [optimizationDialogOpen, setOptimizationDialogOpen] = useState(false);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(
    new Set()
  );

  const { prompts, activePrompt, optimizationRuns, refetchPrompts } =
    usePromptQueries();

  const { jobId, status, isOptimizing, startPolling } = useOptimizationPolling({
    onComplete: refetchPrompts,
  });

  const { startOptimization, deployPrompt, exportResults } = usePromptMutations(
    {
      onOptimizationStart: (newJobId) => {
        startPolling(newJobId);
        setOptimizationDialogOpen(false);
      },
    }
  );

  const handleTogglePromptExpand = useCallback((id: string) => {
    setExpandedPromptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDeploy = useCallback(
    (promptId: string) => {
      deployPrompt.mutate({ promptId });
    },
    [deployPrompt]
  );

  const handleExport = useCallback(
    (promptId: string) => {
      exportResults.mutate({ promptId });
    },
    [exportResults]
  );

  const handleStartOptimization = useCallback(
    (params: {
      maxIterations: number;
      variantsPerIteration: number;
      beamWidth: number;
    }) => {
      if (activePrompt) {
        startOptimization.mutate({
          startingPromptId: activePrompt.id,
          ...params,
        });
      }
    },
    [activePrompt, startOptimization]
  );

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col px-6 py-4 overflow-hidden">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Prompt Optimization</h1>
            <p className="text-muted-foreground mt-2">
              Automatically optimize lead ranking prompts using AI-powered beam
              search
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">Back to Leads</Link>
          </Button>
        </div>

        {/* Optimization Status Banner */}
        {isOptimizing && jobId && (
          <OptimizationStatusBanner jobId={jobId} status={status?.status} />
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Left: Prompt Versions */}
          <PromptVersionsList
            prompts={prompts}
            optimizationRuns={optimizationRuns}
            expandedPromptIds={expandedPromptIds}
            onTogglePromptExpand={handleTogglePromptExpand}
            onDeploy={handleDeploy}
            onExport={handleExport}
            isDeploying={deployPrompt.isPending}
            isExporting={exportResults.isPending}
          />

          {/* Right: Active Prompt */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            <Card className="flex flex-col flex-1 min-h-0">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Active Prompt
                      <Badge variant="default" className="ml-2">
                        v{activePrompt?.version}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1.5">
                      Currently deployed prompt for lead ranking
                    </CardDescription>
                  </div>
                  <OptimizationDialog
                    open={optimizationDialogOpen}
                    onOpenChange={setOptimizationDialogOpen}
                    onStart={handleStartOptimization}
                    isOptimizing={isOptimizing}
                    isStarting={startOptimization.isPending}
                    disabled={!activePrompt}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {activePrompt && activePrompt.mae !== null && (
                  <div className="mb-4 flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <MetricLabel metric="kendall" />
                      <span className="font-semibold">
                        {activePrompt.kendallTau?.toFixed(3) || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MetricLabel metric="spearman" />
                      <span className="font-semibold">
                        {activePrompt.spearmanCorrelation?.toFixed(3) || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MetricLabel metric="mae" />
                      <span className="font-semibold">
                        {activePrompt.mae?.toFixed(2) || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MetricLabel metric="rmse" />
                      <span className="font-semibold">
                        {activePrompt.rmse?.toFixed(2) || "N/A"}
                      </span>
                    </div>
                  </div>
                )}
                {activePrompt && activePrompt.mae === null && (
                  <div className="mb-4">
                    <Badge variant="secondary">Not Evaluated Yet</Badge>
                    <p className="text-xs text-muted-foreground mt-2">
                      Run optimization to evaluate this prompt's performance
                    </p>
                  </div>
                )}
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto flex-1 font-mono">
                  {activePrompt?.promptText}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
