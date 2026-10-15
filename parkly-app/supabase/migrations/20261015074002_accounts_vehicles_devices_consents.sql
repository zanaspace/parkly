CREATE TYPE "public"."consent_type" AS ENUM('TERMS', 'PRIVACY', 'MARKETING', 'LOCATION');--> statement-breakpoint
CREATE TYPE "public"."dsr_status" AS ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."dsr_type" AS ENUM('ACCESS', 'CORRECTION', 'DELETION', 'PORTABILITY', 'OBJECTION');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ANDROID', 'IOS', 'WEB', 'PWA');--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"version" varchar(32) NOT NULL,
	"granted" boolean NOT NULL,
	"ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "dsr_type" NOT NULL,
	"status" "dsr_status" DEFAULT 'OPEN' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"handled_by" uuid,
	"completed_at" timestamp with time zone,
	"export_storage_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_device_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"push_token_enc" text,
	"app_version" varchar(32),
	"auth_session_id" uuid,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"operator_id" uuid,
	"lot_id" uuid,
	"device_key_public" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plate_raw" varchar(20) NOT NULL,
	"plate_norm" varchar(12) NOT NULL,
	"make" varchar(40),
	"model" varchar(40),
	"colour" varchar(40),
	"is_default" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_type_idx" ON "consents" USING btree ("user_id","type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dsr_user_type_open_key" ON "data_subject_requests" USING btree ("user_id","type") WHERE "data_subject_requests"."status" in ('OPEN', 'IN_PROGRESS');--> statement-breakpoint
CREATE INDEX "dsr_status_due_idx" ON "data_subject_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_client_device_key" ON "devices" USING btree ("user_id","client_device_id");--> statement-breakpoint
CREATE INDEX "devices_auth_session_idx" ON "devices" USING btree ("auth_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_user_plate_key" ON "vehicles" USING btree ("user_id","plate_norm") WHERE "vehicles"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_user_default_key" ON "vehicles" USING btree ("user_id") WHERE "vehicles"."is_default" and "vehicles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "vehicles_plate_norm_idx" ON "vehicles" USING btree ("plate_norm");--> statement-breakpoint
CREATE POLICY "consents_api_select" ON "consents" AS PERMISSIVE FOR SELECT TO "parkly_api" USING (true);--> statement-breakpoint
CREATE POLICY "consents_api_insert" ON "consents" AS PERMISSIVE FOR INSERT TO "parkly_api" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "data_subject_requests_api_all" ON "data_subject_requests" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "devices_api_all" ON "devices" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "vehicles_api_all" ON "vehicles" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);