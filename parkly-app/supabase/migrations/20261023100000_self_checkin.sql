ALTER TYPE "public"."entry_method" ADD VALUE 'SELF';--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "self_checkin_enabled" boolean DEFAULT false NOT NULL;