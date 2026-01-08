import type { RouterClient } from "@orpc/server";
import { leadsRouter } from "./leads.router";
import { rankingRouter } from "./ranking.router";
import { csvRouter } from "./csv.router";
import { promptOptimizationRouter } from "./prompt-optimization.router";

/**
 * App Router
 * Combines all domain routers into a single nested API structure
 *
 * Usage:
 * - orpc.leads.list()
 * - orpc.ranking.rankAllLeads()
 * - orpc.ranking.status()
 * - orpc.csv.upload()
 * - orpc.csv.importStatus()
 * - orpc.csv.history()
 * - orpc.promptOptimization.listPrompts()
 * - orpc.promptOptimization.startOptimization()
 */
export const appRouter = {
  leads: leadsRouter,
  ranking: rankingRouter,
  csv: csvRouter,
  promptOptimization: promptOptimizationRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
