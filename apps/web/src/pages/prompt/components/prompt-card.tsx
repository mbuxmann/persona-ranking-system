import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react";
import type { PromptData } from "../types";

interface PromptCardProps {
  prompt: PromptData;
  isBaseline: boolean;
  expandedPromptIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onDeploy: (promptId: string) => void;
  onExport: (promptId: string) => void;
  isDeploying: boolean;
  isExporting: boolean;
}

export const PromptCard = memo(function PromptCard({
  prompt,
  isBaseline,
  expandedPromptIds,
  onToggleExpand,
  onDeploy,
  onExport,
  isDeploying,
  isExporting,
}: PromptCardProps) {
  const isExpanded = expandedPromptIds.has(prompt.id);

  return (
    <div className="border rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Version {prompt.version}</span>
          {prompt.isActive && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          )}
          {prompt.isBaseline && <Badge variant="outline">Baseline</Badge>}
          {prompt.beamRank === 1 && !isBaseline && (
            <Badge
              variant="default"
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              Best
            </Badge>
          )}
          {prompt.beamRank && prompt.beamRank > 1 && (
            <Badge variant="secondary">#{prompt.beamRank}</Badge>
          )}
          {prompt.deployedAt && !prompt.isActive && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Previously Deployed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExport(prompt.id)}
            disabled={prompt.mae === null || isExporting}
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button
            size="sm"
            variant={prompt.isActive ? "outline" : "default"}
            onClick={() => onDeploy(prompt.id)}
            disabled={prompt.isActive || isDeploying}
          >
            {prompt.isActive ? "Deployed" : "Deploy"}
          </Button>
        </div>
      </div>

      {prompt.mae !== null && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">MAE:</span>{" "}
            <span className="font-medium">{prompt.mae.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">RMSE:</span>{" "}
            <span className="font-medium">
              {prompt.rmse?.toFixed(2) || "N/A"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Spearman:</span>{" "}
            <span className="font-medium">
              {prompt.spearmanCorrelation?.toFixed(3) || "N/A"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Kendall:</span>{" "}
            <span className="font-medium">
              {prompt.kendallTau?.toFixed(3) || "N/A"}
            </span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-2">
        Created: {new Date(prompt.createdAt).toLocaleString()}
        {prompt.deployedAt && (
          <> • Deployed: {new Date(prompt.deployedAt).toLocaleString()}</>
        )}
      </div>

      <button
        onClick={() => onToggleExpand(prompt.id)}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-3 transition-colors"
      >
        {isExpanded ? (
          <>
            Hide Prompt <ChevronUp className="h-4 w-4" />
          </>
        ) : (
          <>
            View Prompt <ChevronDown className="h-4 w-4" />
          </>
        )}
      </button>

      {isExpanded && (
        <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 font-mono mt-2 whitespace-pre-wrap">
          {prompt.promptText}
        </pre>
      )}
    </div>
  );
});
