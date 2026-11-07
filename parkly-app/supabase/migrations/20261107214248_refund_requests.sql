CREATE TYPE "public"."refund_request_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"note" text NOT NULL,
	"status" "refund_request_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_requests_amount_check" CHECK ("refund_requests"."amount_kobo" > 0),
	CONSTRAINT "refund_requests_four_eyes_check" CHECK ("refund_requests"."decided_by" is null or "refund_requests"."decided_by" <> "refund_requests"."requested_by")
);
--> statement-breakpoint
ALTER TABLE "refund_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refund_requests_booking_idx" ON "refund_requests" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "refund_requests_status_created_idx" ON "refund_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "refund_requests_requested_by_idx" ON "refund_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "refund_requests_decided_by_idx" ON "refund_requests" USING btree ("decided_by");--> statement-breakpoint
CREATE POLICY "refund_requests_api_all" ON "refund_requests" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);