CREATE TYPE "public"."incident_category" AS ENUM('SAFETY', 'DAMAGE', 'THEFT', 'OVERCHARGE', 'TOUT', 'ACCESS_DENIED', 'LOT_FULL', 'APP_ISSUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('OPEN', 'TRIAGED', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "incident_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lot_id" uuid NOT NULL,
	"booking_id" uuid,
	"reporter_user_id" uuid NOT NULL,
	"reporter_role" text NOT NULL,
	"category" "incident_category" NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"description" text NOT NULL,
	"status" "incident_status" DEFAULT 'OPEN' NOT NULL,
	"assignee_id" uuid,
	"resolution" text,
	"triaged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_notes_incident_idx" ON "incident_notes" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_notes_author_idx" ON "incident_notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "incidents_lot_created_idx" ON "incidents" USING btree ("lot_id","created_at");--> statement-breakpoint
CREATE INDEX "incidents_status_severity_idx" ON "incidents" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE INDEX "incidents_booking_idx" ON "incidents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "incidents_reporter_idx" ON "incidents" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "incidents_assignee_idx" ON "incidents" USING btree ("assignee_id");--> statement-breakpoint
CREATE POLICY "incident_notes_api_all" ON "incident_notes" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "incidents_api_all" ON "incidents" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);