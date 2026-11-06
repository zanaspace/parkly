CREATE TYPE "public"."reconciliation_result" AS ENUM('MATCHED', 'MISSING_INTERNAL', 'MISSING_PROVIDER', 'AMOUNT_MISMATCH', 'STATUS_MISMATCH', 'AUTO_FIXED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_run_status" AS ENUM('RUNNING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED');--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"payment_id" uuid,
	"provider_reference" varchar(100) NOT NULL,
	"result" "reconciliation_result" NOT NULL,
	"details" jsonb NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_date" date NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "reconciliation_run_status" DEFAULT 'RUNNING' NOT NULL,
	"total_internal" integer DEFAULT 0 NOT NULL,
	"total_provider" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"mismatched_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_items_run_idx" ON "reconciliation_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "reconciliation_items_result_idx" ON "reconciliation_items" USING btree ("result");--> statement-breakpoint
CREATE INDEX "reconciliation_items_reference_idx" ON "reconciliation_items" USING btree ("provider_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_runs_provider_date_key" ON "reconciliation_runs" USING btree ("provider","business_date");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_status_idx" ON "reconciliation_runs" USING btree ("status");--> statement-breakpoint
CREATE POLICY "reconciliation_items_api_all" ON "reconciliation_items" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "reconciliation_runs_api_all" ON "reconciliation_runs" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);