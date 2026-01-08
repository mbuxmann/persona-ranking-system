import { useState, useMemo, useCallback } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { columns, type Lead } from "../columns";

interface UseLeadsTableOptions {
  leads: Lead[];
}

export function useLeadsTable({ leads }: UseLeadsTableOptions) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "companyRank", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const uniqueUploads = useMemo(() => {
    const uploadsMap = new Map<string, { id: string; filename: string }>();
    for (const lead of leads) {
      if (lead.uploadId && lead.uploadFilename) {
        uploadsMap.set(lead.uploadId, {
          id: lead.uploadId,
          filename: lead.uploadFilename,
        });
      }
    }
    return Array.from(uploadsMap.values());
  }, [leads]);

  const handleSourceFilterChange = useCallback((value: string) => {
    setSourceFilter(value);
    setColumnFilters((prev) => {
      const otherFilters = prev.filter((f) => f.id !== "uploadFilename");
      if (value === "all") {
        return otherFilters;
      }
      return [...otherFilters, { id: "uploadFilename", value }];
    });
  }, []);

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return {
    table,
    globalFilter,
    setGlobalFilter,
    sourceFilter,
    uniqueUploads,
    handleSourceFilterChange,
  };
}
