import { relations } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { leads } from "./leads";

export const uploadStatusEnum = pgEnum("upload_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull().unique(),
    filename: text("filename").notNull(),
    status: uploadStatusEnum("status").notNull(),
    totalRows: integer("total_rows").default(0),
    companiesAdded: integer("companies_added").default(0),
    companiesUpdated: integer("companies_updated").default(0),
    leadsAdded: integer("leads_added").default(0),
    leadsSkipped: integer("leads_skipped").default(0),
    rankingJobId: text("ranking_job_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at"),
  },
  (table) => [index("idx_uploads_status").on(table.status)]
);

export const uploadsRelations = relations(uploads, ({ many }) => ({
  leads: many(leads),
}));
