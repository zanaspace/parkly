CREATE TYPE "public"."booking_actor" AS ENUM('DRIVER', 'ADMIN', 'ATTENDANT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('MOBILE', 'WEB', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('BOOKING', 'EXTENSION', 'OVERSTAY', 'PASS');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('PAYSTACK', 'FLUTTERWAVE', 'FAKE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('DRIVER_CANCEL', 'HOLD_EXPIRED', 'LOT_UNAVAILABLE', 'OPS_GOODWILL', 'DUPLICATE', 'PERMIT_SUSPENSION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."webhook_processing_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor_type" "booking_actor" NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_status_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(9) NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"plate_norm_snapshot" varchar(12) NOT NULL,
	"lot_id" uuid NOT NULL,
	"product" "product" NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"price_kobo" bigint NOT NULL,
	"service_fee_kobo" bigint NOT NULL,
	"total_kobo" bigint NOT NULL,
	"commission_bps" integer NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"pricing_breakdown" jsonb NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"source" "booking_source" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_window_check" CHECK ("bookings"."end_at" > "bookings"."start_at"),
	CONSTRAINT "bookings_grid_check" CHECK (extract(epoch from "bookings"."start_at")::bigint % 900 = 0 and extract(epoch from "bookings"."end_at")::bigint % 900 = 0),
	CONSTRAINT "bookings_product_check" CHECK ("bookings"."product" in ('HOURLY', 'DAILY')),
	CONSTRAINT "bookings_amounts_check" CHECK ("bookings"."price_kobo" > 0 and "bookings"."service_fee_kobo" >= 0 and "bookings"."total_kobo" = "bookings"."price_kobo" + "bookings"."service_fee_kobo"),
	CONSTRAINT "bookings_commission_check" CHECK ("bookings"."commission_bps" between 0 and 10000),
	CONSTRAINT "bookings_hold_check" CHECK ("bookings"."status" <> 'PENDING_PAYMENT' or "bookings"."hold_expires_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"actor_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"method" varchar(8) NOT NULL,
	"path" text NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" "idempotency_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_status" smallint,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_actor_id_key_pk" PRIMARY KEY("actor_id","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"payment_id" uuid,
	"refund_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount_kobo" > 0)
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"booking_id" uuid,
	"payer_user_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_reference" varchar(100) NOT NULL,
	"provider_access_code" varchar(100),
	"authorization_url" text,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"fees_kobo" bigint,
	"platform_amount_kobo" bigint NOT NULL,
	"operator_amount_kobo" bigint NOT NULL,
	"operator_id" uuid NOT NULL,
	"subaccount_code" varchar(64),
	"status" "payment_status" DEFAULT 'INITIATED' NOT NULL,
	"channel" varchar(32),
	"card_last4" char(4),
	"card_brand" varchar(32),
	"paid_at" timestamp with time zone,
	"failure_code" varchar(64),
	"failure_message" text,
	"raw_verify" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_target_check" CHECK ("payments"."kind" <> 'BOOKING' or "payments"."booking_id" is not null),
	CONSTRAINT "payments_amounts_check" CHECK ("payments"."amount_kobo" > 0 and "payments"."platform_amount_kobo" >= 0 and "payments"."operator_amount_kobo" >= 0
        and "payments"."platform_amount_kobo" + "payments"."operator_amount_kobo" = "payments"."amount_kobo")
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"provider_refund_id" varchar(100),
	"requested_by" uuid,
	"approved_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount_kobo" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"reference" varchar(100),
	"signature_valid" boolean DEFAULT true NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_status" "webhook_processing_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_idx" ON "booking_status_history" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "bookings_driver_start_idx" ON "bookings" USING btree ("driver_id","start_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_lot_start_idx" ON "bookings" USING btree ("lot_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_status_hold_idx" ON "bookings" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "bookings_status_start_idx" ON "bookings" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "bookings_vehicle_idx" ON "bookings" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "bookings_rate_plan_idx" ON "bookings" USING btree ("rate_plan_id");--> statement-breakpoint
CREATE INDEX "bookings_cancelled_by_idx" ON "bookings" USING btree ("cancelled_by");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ledger_accounts_operator_idx" ON "ledger_accounts" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_refund_idx" ON "ledger_entries" USING btree ("refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_payer_idx" ON "payments" USING btree ("payer_user_id");--> statement-breakpoint
CREATE INDEX "payments_operator_idx" ON "payments" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_requested_by_idx" ON "refunds" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "refunds_approved_by_idx" ON "refunds" USING btree ("approved_by");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_key" ON "webhook_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("processing_status","received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_reference_idx" ON "webhook_events" USING btree ("reference");--> statement-breakpoint
CREATE POLICY "booking_status_history_api_select" ON "booking_status_history" AS PERMISSIVE FOR SELECT TO "parkly_api" USING (true);--> statement-breakpoint
CREATE POLICY "booking_status_history_api_insert" ON "booking_status_history" AS PERMISSIVE FOR INSERT TO "parkly_api" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "bookings_api_all" ON "bookings" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "idempotency_keys_api_all" ON "idempotency_keys" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "ledger_accounts_api_all" ON "ledger_accounts" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "ledger_entries_api_select" ON "ledger_entries" AS PERMISSIVE FOR SELECT TO "parkly_api" USING (true);--> statement-breakpoint
CREATE POLICY "ledger_entries_api_insert" ON "ledger_entries" AS PERMISSIVE FOR INSERT TO "parkly_api" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "payments_api_all" ON "payments" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "refunds_api_all" ON "refunds" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "webhook_events_api_all" ON "webhook_events" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);