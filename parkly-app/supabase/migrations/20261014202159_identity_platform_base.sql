CREATE TYPE "public"."role" AS ENUM('DRIVER', 'OPERATOR_OWNER', 'OPERATOR_MANAGER', 'OPERATOR_ATTENDANT', 'ADMIN_SUPPORT', 'ADMIN_OPS', 'ADMIN_FINANCE', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'LOCKED', 'SUSPENDED', 'PENDING_DELETION', 'DELETED');--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"operator_id" uuid,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_role_operator_key" UNIQUE NULLS NOT DISTINCT("user_id","role","operator_id")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_hash" "bytea",
	"phone_last4" text,
	"email_hash" "bytea",
	"first_name" varchar(50),
	"last_name" varchar(50),
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"locale" text DEFAULT 'en-NG' NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" "bytea",
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_roles_operator_idx" ON "user_roles" USING btree ("operator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_hash_key" ON "users" USING btree ("phone_hash") WHERE "users"."phone_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_hash_key" ON "users" USING btree ("email_hash") WHERE "users"."email_hash" is not null;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE POLICY "user_roles_api_all" ON "user_roles" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "users_api_all" ON "users" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "audit_logs_api_select" ON "audit_logs" AS PERMISSIVE FOR SELECT TO "parkly_api" USING (true);--> statement-breakpoint
CREATE POLICY "audit_logs_api_insert" ON "audit_logs" AS PERMISSIVE FOR INSERT TO "parkly_api" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "feature_flags_api_all" ON "feature_flags" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "platform_settings_api_all" ON "platform_settings" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);