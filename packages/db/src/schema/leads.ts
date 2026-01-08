import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { uploads } from "./uploads";

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    jobTitle: text("job_title").notNull(),
    qualified: boolean("qualified").default(false),
    qualificationReasoning: text("qualification_reasoning"),
    companyRank: numeric("company_rank", { precision: 10, scale: 0 }),
    rankingReasoning: text("ranking_reasoning"),
    rankedAt: timestamp("ranked_at"),
    rankingSessionId: uuid("ranking_session_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("unique_lead_per_company").on(
      table.firstName,
      table.lastName,
      table.companyId
    ),
    index("idx_leads_company_id").on(table.companyId),
    index("idx_leads_company_rank").on(table.companyRank.asc()),
    index("idx_leads_upload_id").on(table.uploadId),
    index("idx_leads_ranked_at").on(table.rankedAt),
    index("idx_leads_qualified").on(table.qualified),
  ]
);

export const leadsRelations = relations(leads, ({ one }) => ({
  company: one(companies, {
    fields: [leads.companyId],
    references: [companies.id],
  }),
  upload: one(uploads, {
    fields: [leads.uploadId],
    references: [uploads.id],
  }),
}));
