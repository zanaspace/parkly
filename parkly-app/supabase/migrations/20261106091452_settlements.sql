CREATE TYPE "public"."settlement_status" AS ENUM('PENDING', 'SETTLED', 'FAILED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_settlement_id" varchar(64) NOT NULL,
	"operator_id" uuid,
	"subaccount_code" varchar(64),
	"status" "settlement_status" NOT NULL,
	"amount_kobo" bigint,
	"gross_kobo" bigint,
	"fees_kobo" bigint,
	"settled_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"review_reason" text,
	"ledger_journal_id" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_amounts_check" CHECK (coalesce("settlements"."amount_kobo", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "settlement_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_provider_id_key" ON "settlements" USING btree ("provider","provider_settlement_id");--> statement-breakpoint
CREATE INDEX "settlements_operator_idx" ON "settlements" USING btree ("operator_id","settled_at");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_settlement_idx" ON "ledger_entries" USING btree ("settlement_id");--> statement-breakpoint
CREATE POLICY "settlements_api_all" ON "settlements" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);