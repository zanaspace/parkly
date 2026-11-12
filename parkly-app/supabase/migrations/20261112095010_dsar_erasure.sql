ALTER TYPE "public"."dsr_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
CREATE TABLE "erasure_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"dsr_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erasure_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_id_users_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "erasure_log_user_key" ON "erasure_log" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "erasure_log_api_all" ON "erasure_log" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);