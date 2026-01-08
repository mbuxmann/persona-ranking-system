import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ExportDialog,
  LeadsTable,
  UploadSheet,
  UploadStatusBanner,
} from "./components";
import { useHomeQueries, useRankingJob } from "./hooks";

export function HomePage() {
  const { leads, isLoadingLeads, hasActiveUploads, rankedCount } =
    useHomeQueries();

  const { isRanking, isStarting, startRanking } = useRankingJob();

  return (
    <div className="px-6 py-4">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold">Persona Ranker</h1>
          <p className="text-muted-foreground">
            Rank leads using AI against your ideal customer persona
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/prompts">Prompt Optimization</Link>
        </Button>
      </div>

      <Separator className="mb-6" />

      {/* Actions */}
      <div className="mb-6 flex items-center justify-end gap-3">
        <UploadSheet disabled={hasActiveUploads} />
        <ExportDialog disabled={rankedCount === 0} />
        <Button
          variant="outline"
          onClick={startRanking}
          disabled={isStarting || isRanking || hasActiveUploads}
        >
          {isRanking ? "Ranking..." : isStarting ? "Starting..." : "Rank"}
        </Button>
      </div>

      {/* Status Banner */}
      <UploadStatusBanner />

      {/* Leads Table */}
      <LeadsTable leads={leads} isLoading={isLoadingLeads} />
    </div>
  );
}
