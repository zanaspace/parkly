CREATE TYPE "public"."extension_kind" AS ENUM('EXTEND', 'EARLY_START');--> statement-breakpoint
ALTER TABLE "booking_extensions" ADD COLUMN "kind" "extension_kind" DEFAULT 'EXTEND' NOT NULL;