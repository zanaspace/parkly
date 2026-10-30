CREATE TABLE "receipt_counters" (
	"operator_id" uuid PRIMARY KEY NOT NULL,
	"last_seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"revised_at" timestamp with time zone NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_booking_key" ON "receipts" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_operator_seq_key" ON "receipts" USING btree ("operator_id","seq");--> statement-breakpoint
CREATE INDEX "receipts_operator_idx" ON "receipts" USING btree ("operator_id");--> statement-breakpoint
CREATE POLICY "receipt_counters_api_all" ON "receipt_counters" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "receipts_api_all" ON "receipts" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);