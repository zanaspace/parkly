CREATE TYPE "public"."checkin_event_type" AS ENUM('CHECK_IN', 'CHECK_OUT', 'WALK_IN', 'ISSUE');--> statement-breakpoint
CREATE TYPE "public"."entry_method" AS ENUM('QR', 'CODE', 'PLATE', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."overstay_status" AS ENUM('NONE', 'DUE', 'PAID', 'UNPAID', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."sync_result" AS ENUM('APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED');--> statement-breakpoint
CREATE TABLE "attendant_sync_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"attendant_id" uuid NOT NULL,
	"event_count" integer NOT NULL,
	"device_sent_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone NOT NULL,
	"clock_offset_ms" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendant_sync_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkin_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_event_id" uuid NOT NULL,
	"type" "checkin_event_type" NOT NULL,
	"lot_id" uuid NOT NULL,
	"booking_id" uuid,
	"session_id" uuid,
	"method" "entry_method",
	"plate_seen" varchar(12),
	"delta" integer,
	"override_reason" varchar(200),
	"note" varchar(500),
	"attendant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"device_time" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone NOT NULL,
	"result" "sync_result" NOT NULL,
	"result_reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_events_delta_check" CHECK ("checkin_events"."delta" is null or "checkin_events"."delta" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "checkin_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lot_walk_ins" (
	"lot_id" uuid PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_walk_ins_count_check" CHECK ("lot_walk_ins"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lot_walk_ins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"plate_norm" varchar(12) NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"check_in_by" uuid,
	"check_out_by" uuid,
	"entry_method" "entry_method",
	"overstay_minutes" integer DEFAULT 0 NOT NULL,
	"overstay_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"overstay_status" "overstay_status" DEFAULT 'NONE' NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_overstay_check" CHECK ("sessions"."overstay_minutes" >= 0 and "sessions"."overstay_amount_kobo" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendant_sync_batches" ADD CONSTRAINT "attendant_sync_batches_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_sync_batches" ADD CONSTRAINT "attendant_sync_batches_attendant_id_users_id_fk" FOREIGN KEY ("attendant_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_attendant_id_users_id_fk" FOREIGN KEY ("attendant_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_walk_ins" ADD CONSTRAINT "lot_walk_ins_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_check_in_by_users_id_fk" FOREIGN KEY ("check_in_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_check_out_by_users_id_fk" FOREIGN KEY ("check_out_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendant_sync_batches_device_idx" ON "attendant_sync_batches" USING btree ("device_id","server_received_at");--> statement-breakpoint
CREATE INDEX "attendant_sync_batches_lot_idx" ON "attendant_sync_batches" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "attendant_sync_batches_attendant_idx" ON "attendant_sync_batches" USING btree ("attendant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_events_client_event_key" ON "checkin_events" USING btree ("client_event_id");--> statement-breakpoint
CREATE INDEX "checkin_events_lot_idx" ON "checkin_events" USING btree ("lot_id","occurred_at");--> statement-breakpoint
CREATE INDEX "checkin_events_booking_idx" ON "checkin_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "checkin_events_session_idx" ON "checkin_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "checkin_events_attendant_idx" ON "checkin_events" USING btree ("attendant_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_booking_key" ON "sessions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "sessions_lot_check_in_idx" ON "sessions" USING btree ("lot_id","check_in_at");--> statement-breakpoint
CREATE INDEX "sessions_check_in_by_idx" ON "sessions" USING btree ("check_in_by");--> statement-breakpoint
CREATE INDEX "sessions_check_out_by_idx" ON "sessions" USING btree ("check_out_by");--> statement-breakpoint
CREATE POLICY "attendant_sync_batches_api_all" ON "attendant_sync_batches" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "checkin_events_api_select" ON "checkin_events" AS PERMISSIVE FOR SELECT TO "parkly_api" USING (true);--> statement-breakpoint
CREATE POLICY "checkin_events_api_insert" ON "checkin_events" AS PERMISSIVE FOR INSERT TO "parkly_api" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "lot_walk_ins_api_all" ON "lot_walk_ins" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "sessions_api_all" ON "sessions" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);