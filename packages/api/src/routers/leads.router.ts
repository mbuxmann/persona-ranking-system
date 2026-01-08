import { publicProcedure } from "../index";
import { services } from "../services";
import { leadWithRankingSchema } from "../schemas/ranking";
import { leadsListInputSchema, exportLeadsInputSchema } from "../schemas/leads";
import { z } from "zod";

/**
 * Leads Router
 * Handles lead listing and exporting
 */
export const leadsRouter = {
  /**
   * List all leads with company and ranking info
   * Optionally filter by upload ID
   */
  list: publicProcedure
    .input(leadsListInputSchema)
    .output(leadWithRankingSchema.array())
    .handler(async ({ input }) => services.leads.listLeads(input?.uploadId)),

  /**
   * Export top N leads per company to CSV
   */
  export: publicProcedure
    .input(exportLeadsInputSchema)
    .output(z.string())
    .handler(async ({ input }) => services.csv.generateCSV(input.topN)),
};
