CREATE TABLE "corporate_fleet_drivers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corporate_id" uuid NOT NULL,
	"driver_name" varchar(120) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"vehicle_plate" varchar(20),
	"join_code" varchar(20) NOT NULL,
	"approval_status" varchar(30) DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_fleet_drivers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "corporate_fleet_drivers" ADD CONSTRAINT "corporate_fleet_drivers_corporate_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_fleet_drivers" ADD CONSTRAINT "corporate_fleet_drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_fleet_drivers_join_code_key" ON "corporate_fleet_drivers" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "corporate_fleet_drivers_corporate_id_idx" ON "corporate_fleet_drivers" USING btree ("corporate_id");--> statement-breakpoint
CREATE INDEX "corporate_fleet_drivers_phone_idx" ON "corporate_fleet_drivers" USING btree ("phone");--> statement-breakpoint
CREATE POLICY "corporate_fleet_drivers_api_all" ON "corporate_fleet_drivers" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);