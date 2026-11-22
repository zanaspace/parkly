CREATE TYPE "public"."corporate_booking_status" AS ENUM('ACCRUED', 'INVOICED', 'PAID');--> statement-breakpoint
CREATE TABLE "corporate_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corporate_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"cost_center_id" uuid,
	"work_email" varchar(254),
	"company_name" varchar(200) NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"service_fee_kobo" bigint DEFAULT 10000 NOT NULL,
	"vat_kobo" bigint DEFAULT 0 NOT NULL,
	"billing_period" varchar(7) NOT NULL,
	"status" "corporate_booking_status" DEFAULT 'ACCRUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "corporate_bookings" ADD CONSTRAINT "corporate_bookings_corporate_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_bookings" ADD CONSTRAINT "corporate_bookings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_bookings" ADD CONSTRAINT "corporate_bookings_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_bookings" ADD CONSTRAINT "corporate_bookings_cost_center_id_corporate_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."corporate_cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_bookings_booking_id_key" ON "corporate_bookings" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "corporate_bookings_corp_period_idx" ON "corporate_bookings" USING btree ("corporate_id","billing_period");--> statement-breakpoint
CREATE INDEX "corporate_bookings_corp_created_idx" ON "corporate_bookings" USING btree ("corporate_id","created_at");--> statement-breakpoint
CREATE INDEX "corporate_bookings_driver_idx" ON "corporate_bookings" USING btree ("driver_user_id");--> statement-breakpoint
CREATE POLICY "corporate_bookings_api_all" ON "corporate_bookings" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);