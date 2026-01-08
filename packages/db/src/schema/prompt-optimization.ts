import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const optimizationStatusEnum = pgEnum("optimization_status", [
  "running",
  "completed",
  "failed",
]);

export const evaluationLeads = pgTable(
  "evaluation_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    jobTitle: text("job_title").notNull(),
    companyName: text("company_name").notNull(),
    companyDomain: text("company_domain"),
    employeeRange: text("employee_range").notNull(),
    industry: text("industry"),
    groundTruthRank: integer("ground_truth_rank").notNull(),
    groundTruthReasoning: text("ground_truth_reasoning"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_evaluation_leads_rank").on(table.groundTruthRank)]
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    iterationNumber: integer("iteration_number").notNull().default(0),
    promptText: text("prompt_text").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    isBaseline: boolean("is_baseline").notNull().default(false),
    beamRank: integer("beam_rank"),
    parentVersionId: uuid("parent_version_id").references(
      (): AnyPgColumn => promptVersions.id,
      { onDelete: "set null" }
    ),
    optimizationRunId: uuid("optimization_run_id").references(
      (): AnyPgColumn => optimizationRuns.id,
      { onDelete: "set null" }
    ),
    mae: numeric("mae", { precision: 10, scale: 4 }),
    rmse: numeric("rmse", { precision: 10, scale: 4 }),
    spearmanCorrelation: numeric("spearman_correlation", { precision: 10, scale: 4 }),
    kendallTau: numeric("kendall_tau", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deployedAt: timestamp("deployed_at"),
  },
  (table) => [
    index("idx_prompt_versions_is_active").on(table.isActive),
    index("idx_prompt_versions_optimization_run_id").on(table.optimizationRunId),
    index("idx_prompt_versions_parent_version_id").on(table.parentVersionId),
  ]
);

export const optimizationRuns = pgTable(
  "optimization_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: optimizationStatusEnum("status").notNull(),
    startingPromptId: uuid("starting_prompt_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "restrict" }),
    maxIterations: integer("max_iterations").notNull().default(5),
    variantsPerIteration: integer("variants_per_iteration").notNull().default(8),
    beamWidth: integer("beam_width").notNull().default(3),
    bestPromptId: uuid("best_prompt_id").references(() => promptVersions.id, {
      onDelete: "set null",
    }),
    totalIterations: integer("total_iterations"),
    totalPromptsGenerated: integer("total_prompts_generated"),
    improvementPercentage: numeric("improvement_percentage", { precision: 10, scale: 2 }),
    triggerJobId: text("trigger_job_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_optimization_runs_status").on(table.status),
    index("idx_optimization_runs_starting_prompt_id").on(table.startingPromptId),
    index("idx_optimization_runs_best_prompt_id").on(table.bestPromptId),
  ]
);

export const evaluationResults = pgTable(
  "evaluation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptVersionId: uuid("prompt_version_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "cascade" }),
    evaluationLeadId: uuid("evaluation_lead_id")
      .notNull()
      .references(() => evaluationLeads.id, { onDelete: "cascade" }),
    predictedRank: integer("predicted_rank").notNull(),
    predictedReasoning: text("predicted_reasoning").notNull(),
    absoluteError: numeric("absolute_error", { precision: 10, scale: 4 }),
    squaredError: numeric("squared_error", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_evaluation_results_prompt_version_id").on(table.promptVersionId),
    index("idx_evaluation_results_evaluation_lead_id").on(table.evaluationLeadId),
  ]
);

export const evaluationLeadsRelations = relations(evaluationLeads, ({ many }) => ({
  evaluationResults: many(evaluationResults),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one, many }) => ({
  parentVersion: one(promptVersions, {
    fields: [promptVersions.parentVersionId],
    references: [promptVersions.id],
    relationName: "promptVersionParent",
  }),
  childVersions: many(promptVersions, {
    relationName: "promptVersionParent",
  }),
  optimizationRun: one(optimizationRuns, {
    fields: [promptVersions.optimizationRunId],
    references: [optimizationRuns.id],
  }),
  evaluationResults: many(evaluationResults),
}));

export const optimizationRunsRelations = relations(optimizationRuns, ({ one, many }) => ({
  startingPrompt: one(promptVersions, {
    fields: [optimizationRuns.startingPromptId],
    references: [promptVersions.id],
    relationName: "optimizationRunStartingPrompt",
  }),
  bestPrompt: one(promptVersions, {
    fields: [optimizationRuns.bestPromptId],
    references: [promptVersions.id],
    relationName: "optimizationRunBestPrompt",
  }),
  generatedPrompts: many(promptVersions),
}));

export const evaluationResultsRelations = relations(evaluationResults, ({ one }) => ({
  promptVersion: one(promptVersions, {
    fields: [evaluationResults.promptVersionId],
    references: [promptVersions.id],
  }),
  evaluationLead: one(evaluationLeads, {
    fields: [evaluationResults.evaluationLeadId],
    references: [evaluationLeads.id],
  }),
}));
