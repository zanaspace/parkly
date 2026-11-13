CREATE TYPE "public"."driver_verification_method" AS ENUM('FRSC_LICENSE', 'NIN_PHONE');--> statement-breakpoint
CREATE TYPE "public"."driver_verification_status" AS ENUM('VERIFIED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('DOJAH', 'FAKE');--> statement-breakpoint
CREATE TYPE "public"."pass_status" AS ENUM('HELD', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."pass_waitlist_status" AS ENUM('WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "driver_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"method" "driver_verification_method" NOT NULL,
	"status" "driver_verification_status" NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_reference" varchar(120) NOT NULL,
	"id_number_enc" text NOT NULL,
	"id_number_hash" "bytea" NOT NULL,
	"masked_id_number" varchar(32) NOT NULL,
	"verified_name" varchar(120),
	"date_of_birth_enc" text,
	"rejection_reason" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pass_waitlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lot_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"desired_start_date" date NOT NULL,
	"status" "pass_waitlist_status" DEFAULT 'WAITING' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pass_waitlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(9) NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"plate_norm_snapshot" varchar(12) NOT NULL,
	"lot_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "pass_status" DEFAULT 'HELD' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"price_kobo" bigint NOT NULL,
	"service_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"total_kobo" bigint NOT NULL,
	"commission_bps" integer NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"pricing_breakdown" jsonb NOT NULL,
	"swaps_used" smallint DEFAULT 0 NOT NULL,
	"last_reminder_days" smallint,
	"renewed_from_pass_id" uuid,
	"source" "booking_source" DEFAULT 'MOBILE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passes_period_check" CHECK ("passes"."period_end" >= "passes"."period_start"),
	CONSTRAINT "passes_window_check" CHECK ("passes"."ends_at" > "passes"."starts_at"),
	CONSTRAINT "passes_amounts_check" CHECK ("passes"."price_kobo" > 0 and "passes"."service_fee_kobo" >= 0 and "passes"."total_kobo" = "passes"."price_kobo" + "passes"."service_fee_kobo"),
	CONSTRAINT "passes_swaps_check" CHECK ("passes"."swaps_used" between 0 and 2),
	CONSTRAINT "passes_hold_check" CHECK ("passes"."status" <> 'HELD' or "passes"."hold_expires_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "passes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "sessions_booking_key";--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_verified_driver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lot_closures" ADD COLUMN "blocked_bays" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "requires_verified_driver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pass_id" uuid;--> statement-breakpoint
ALTER TABLE "checkin_events" ADD COLUMN "pass_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "pass_id" uuid;--> statement-breakpoint
ALTER TABLE "driver_verifications" ADD CONSTRAINT "driver_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pass_waitlist" ADD CONSTRAINT "pass_waitlist_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pass_waitlist" ADD CONSTRAINT "pass_waitlist_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_verifications_user_idx" ON "driver_verifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "driver_verifications_hash_idx" ON "driver_verifications" USING btree ("id_number_hash");--> statement-breakpoint
CREATE INDEX "pass_waitlist_lot_status_idx" ON "pass_waitlist" USING btree ("lot_id","status","created_at");--> statement-breakpoint
CREATE INDEX "pass_waitlist_driver_idx" ON "pass_waitlist" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passes_code_key" ON "passes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "passes_driver_period_idx" ON "passes" USING btree ("driver_id","period_end" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "passes_lot_status_period_idx" ON "passes" USING btree ("lot_id","status","period_start","period_end");--> statement-breakpoint
CREATE INDEX "passes_status_hold_idx" ON "passes" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "passes_vehicle_idx" ON "passes" USING btree ("vehicle_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_pass_idx" ON "payments" USING btree ("pass_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_pass_open_key" ON "sessions" USING btree ("pass_id") WHERE "sessions"."pass_id" is not null and "sessions"."check_out_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_pass_idx" ON "sessions" USING btree ("pass_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_booking_key" ON "sessions" USING btree ("booking_id") WHERE "sessions"."booking_id" is not null;--> statement-breakpoint
ALTER TABLE "lot_closures" ADD CONSTRAINT "lot_closures_bays_check" CHECK ("lot_closures"."blocked_bays" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_pass_target_check" CHECK ("payments"."kind" <> 'PASS' or "payments"."pass_id" is not null);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_source_check" CHECK ("sessions"."booking_id" is not null or "sessions"."pass_id" is not null);--> statement-breakpoint
CREATE POLICY "driver_verifications_api_all" ON "driver_verifications" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "pass_waitlist_api_all" ON "pass_waitlist" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "passes_api_all" ON "passes" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);