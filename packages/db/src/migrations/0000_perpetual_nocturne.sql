CREATE TYPE "public"."upload_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."optimization_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"employee_range" text,
	"industry" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"upload_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"job_title" text NOT NULL,
	"qualified" boolean DEFAULT false,
	"qualification_reasoning" text,
	"company_rank" numeric(10, 0),
	"ranking_reasoning" text,
	"ranked_at" timestamp,
	"ranking_session_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_lead_per_company" UNIQUE("first_name","last_name","company_id")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"filename" text NOT NULL,
	"status" "upload_status" NOT NULL,
	"total_rows" integer DEFAULT 0,
	"companies_added" integer DEFAULT 0,
	"companies_updated" integer DEFAULT 0,
	"leads_added" integer DEFAULT 0,
	"leads_skipped" integer DEFAULT 0,
	"ranking_job_id" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "uploads_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"job_title" text NOT NULL,
	"company_name" text NOT NULL,
	"company_domain" text,
	"employee_range" text NOT NULL,
	"industry" text,
	"ground_truth_rank" integer NOT NULL,
	"ground_truth_reasoning" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"evaluation_lead_id" uuid NOT NULL,
	"predicted_rank" integer NOT NULL,
	"predicted_reasoning" text NOT NULL,
	"absolute_error" numeric(10, 4),
	"squared_error" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "optimization_status" NOT NULL,
	"starting_prompt_id" uuid NOT NULL,
	"max_iterations" integer DEFAULT 5 NOT NULL,
	"variants_per_iteration" integer DEFAULT 8 NOT NULL,
	"beam_width" integer DEFAULT 3 NOT NULL,
	"best_prompt_id" uuid,
	"total_iterations" integer,
	"total_prompts_generated" integer,
	"improvement_percentage" numeric(10, 2),
	"trigger_job_id" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iteration_number" integer DEFAULT 0 NOT NULL,
	"prompt_text" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"beam_rank" integer,
	"parent_version_id" uuid,
	"optimization_run_id" uuid,
	"mae" numeric(10, 4),
	"rmse" numeric(10, 4),
	"spearman_correlation" numeric(10, 4),
	"kendall_tau" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deployed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_lead_id_evaluation_leads_id_fk" FOREIGN KEY ("evaluation_lead_id") REFERENCES "public"."evaluation_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_runs" ADD CONSTRAINT "optimization_runs_starting_prompt_id_prompt_versions_id_fk" FOREIGN KEY ("starting_prompt_id") REFERENCES "public"."prompt_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_runs" ADD CONSTRAINT "optimization_runs_best_prompt_id_prompt_versions_id_fk" FOREIGN KEY ("best_prompt_id") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_parent_version_id_prompt_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_optimization_run_id_optimization_runs_id_fk" FOREIGN KEY ("optimization_run_id") REFERENCES "public"."optimization_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_companies_domain" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_leads_company_id" ON "leads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_leads_company_rank" ON "leads" USING btree ("company_rank");--> statement-breakpoint
CREATE INDEX "idx_leads_upload_id" ON "leads" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "idx_leads_ranked_at" ON "leads" USING btree ("ranked_at");--> statement-breakpoint
CREATE INDEX "idx_leads_qualified" ON "leads" USING btree ("qualified");--> statement-breakpoint
CREATE INDEX "idx_uploads_status" ON "uploads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_evaluation_leads_rank" ON "evaluation_leads" USING btree ("ground_truth_rank");--> statement-breakpoint
CREATE INDEX "idx_evaluation_results_prompt_version_id" ON "evaluation_results" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "idx_evaluation_results_evaluation_lead_id" ON "evaluation_results" USING btree ("evaluation_lead_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_runs_status" ON "optimization_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_optimization_runs_starting_prompt_id" ON "optimization_runs" USING btree ("starting_prompt_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_runs_best_prompt_id" ON "optimization_runs" USING btree ("best_prompt_id");--> statement-breakpoint
CREATE INDEX "idx_prompt_versions_is_active" ON "prompt_versions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_prompt_versions_optimization_run_id" ON "prompt_versions" USING btree ("optimization_run_id");--> statement-breakpoint
CREATE INDEX "idx_prompt_versions_parent_version_id" ON "prompt_versions" USING btree ("parent_version_id");