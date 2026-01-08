import type { ColumnDef } from "@tanstack/react-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QualifiedCell, ReasoningCell } from "./components";

export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  companyName: string;
  employeeRange: string | null;
  industry: string | null;
  qualified: boolean | null;
  companyRank: number | null;
  qualificationReasoning: string | null;
  rankingReasoning: string | null;
  rankedAt: string | null;
  uploadId: string | null;
  uploadFilename: string | null;
  createdAt: string;
};

export const columns: ColumnDef<Lead>[] = [
  {
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">
          {row.original.firstName} {row.original.lastName}
        </div>
        <div className="text-muted-foreground text-sm">
          {row.original.jobTitle}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "companyName",
    header: "Company",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.companyName}</div>
        {row.original.employeeRange && (
          <div className="text-muted-foreground text-xs">
            {row.original.employeeRange}
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: "qualified",
    header: "Qualified",
    cell: ({ row }) => <QualifiedCell qualified={row.original.qualified} />,
  },
  {
    accessorKey: "companyRank",
    header: "Rank",
    sortingFn: (rowA, rowB) => {
      const qualifiedA = rowA.original.qualified;
      const qualifiedB = rowB.original.qualified;
      const rankA = rowA.original.companyRank;
      const rankB = rowB.original.companyRank;

      // Disqualified or not processed always go to bottom
      if (!qualifiedA && qualifiedB) return 1;
      if (qualifiedA && !qualifiedB) return -1;
      if (!qualifiedA && !qualifiedB) return 0;

      // Both qualified - sort by rank (nulls last)
      if (rankA === null && rankB !== null) return 1;
      if (rankA !== null && rankB === null) return -1;
      if (rankA === null && rankB === null) return 0;

      return (rankA ?? 0) - (rankB ?? 0);
    },
    cell: ({ row }) => {
      const qualified = row.original.qualified;
      const rank = row.original.companyRank;

      if (qualified === true && rank !== null) {
        return <div className="font-bold text-green-600">{rank}</div>;
      }

      if (qualified === true && rank === null) {
        return <span className="text-muted-foreground text-xs">Pending</span>;
      }

      return <span className="text-muted-foreground text-lg">-</span>;
    },
  },
  {
    accessorKey: "reasoning",
    header: "Reasoning",
    cell: ({ row }) => (
      <ReasoningCell
        qualificationReasoning={row.original.qualificationReasoning}
        rankingReasoning={row.original.rankingReasoning}
      />
    ),
  },
  {
    accessorKey: "uploadFilename",
    header: "Source",
    cell: ({ row }) => {
      const filename = row.original.uploadFilename;
      if (!filename) {
        return <span className="text-muted-foreground text-xs">-</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-[150px] truncate text-xs cursor-help">
              {filename}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">{filename}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Added",
    cell: ({ row }) => {
      const date = new Date(row.original.createdAt);
      return (
        <span className="text-muted-foreground text-xs">
          {date.toLocaleDateString()}
        </span>
      );
    },
  },
];
