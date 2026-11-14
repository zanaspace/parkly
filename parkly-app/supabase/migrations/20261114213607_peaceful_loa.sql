CREATE TYPE "public"."corporate_member_role" AS ENUM('CORP_ADMIN', 'HR_MANAGER', 'FLEET_DISPATCHER', 'SECURITY_GUARD', 'EMPLOYEE');--> statement-breakpoint
CREATE TABLE "corporate_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"cac_rc_number" varchar(50) NOT NULL,
	"industry" varchar(80) NOT NULL,
	"head_office_address" text NOT NULL,
	"primary_contact_name" varchar(120) NOT NULL,
	"primary_contact_email" varchar(254) NOT NULL,
	"primary_contact_phone" varchar(30) NOT NULL,
	"billing_tier" varchar(50) DEFAULT 'STANDARD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "corporate_branding" (
	"corporate_id" uuid PRIMARY KEY NOT NULL,
	"logo_url" text NOT NULL,
	"primary_color" varchar(20) DEFAULT '#E31837' NOT NULL,
	"secondary_color" varchar(20) DEFAULT '#1E1E1E' NOT NULL,
	"portal_title" varchar(150) NOT NULL,
	"welcome_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_branding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "corporate_cost_centers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corporate_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(120) NOT NULL,
	"monthly_budget_kobo" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_cost_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "corporate_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corporate_id" uuid NOT NULL,
	"subdomain" varchar(64) NOT NULL,
	"custom_domain" varchar(254),
	"email_domain" varchar(254) NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "corporate_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corporate_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "corporate_member_role" DEFAULT 'EMPLOYEE' NOT NULL,
	"cost_center_id" uuid,
	"work_email" varchar(254),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "corporate_branding" ADD CONSTRAINT "corporate_branding_corporate_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_cost_centers" ADD CONSTRAINT "corporate_cost_centers_corporate_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_domains" ADD CONSTRAINT "corporate_domains_corporate_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_members" ADD CONSTRAINT "corporate_members_corporate_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_members" ADD CONSTRAINT "corporate_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_members" ADD CONSTRAINT "corporate_members_cost_center_id_corporate_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."corporate_cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_accounts_slug_key" ON "corporate_accounts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "corporate_accounts_is_active_idx" ON "corporate_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_cost_centers_corp_code_key" ON "corporate_cost_centers" USING btree ("corporate_id","code");--> statement-breakpoint
CREATE INDEX "corporate_cost_centers_corp_id_idx" ON "corporate_cost_centers" USING btree ("corporate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_domains_subdomain_key" ON "corporate_domains" USING btree ("subdomain");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_domains_custom_domain_key" ON "corporate_domains" USING btree ("custom_domain") WHERE "corporate_domains"."custom_domain" is not null;--> statement-breakpoint
CREATE INDEX "corporate_domains_email_domain_idx" ON "corporate_domains" USING btree ("email_domain");--> statement-breakpoint
CREATE INDEX "corporate_domains_corporate_id_idx" ON "corporate_domains" USING btree ("corporate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_members_corp_user_key" ON "corporate_members" USING btree ("corporate_id","user_id");--> statement-breakpoint
CREATE INDEX "corporate_members_user_id_idx" ON "corporate_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corporate_members_corp_id_idx" ON "corporate_members" USING btree ("corporate_id");--> statement-breakpoint
CREATE POLICY "corporate_accounts_api_all" ON "corporate_accounts" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "corporate_branding_api_all" ON "corporate_branding" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "corporate_cost_centers_api_all" ON "corporate_cost_centers" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "corporate_domains_api_all" ON "corporate_domains" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "corporate_members_api_all" ON "corporate_members" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);