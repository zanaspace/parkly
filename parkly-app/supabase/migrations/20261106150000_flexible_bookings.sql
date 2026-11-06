-- ADR 0024: Flexible Bookings ("Park now" hold-then-start, courtesy hold, holding fees, and hold capacity caps)

CREATE TYPE "public"."booking_type" AS ENUM('RESERVE', 'PARK_NOW');--> statement-breakpoint

ALTER TABLE "lots" ADD COLUMN "hold_cap_percent" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "free_hold_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "max_hold_minutes" integer DEFAULT 180 NOT NULL;--> statement-breakpoint

ALTER TABLE "lots" ADD CONSTRAINT "lots_hold_cap_percent_check" CHECK ("hold_cap_percent" >= 0 and "hold_cap_percent" <= 100);--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_free_hold_minutes_check" CHECK ("free_hold_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_max_hold_minutes_check" CHECK ("max_hold_minutes" >= "free_hold_minutes");--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN "booking_type" "booking_type" DEFAULT 'RESERVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "hold_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "holding_fee_kobo" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE INDEX "bookings_lot_active_holds_idx" ON "bookings" ("lot_id", "booking_type", "status")
  WHERE "booking_type" = 'PARK_NOW' AND "status" IN ('PENDING_PAYMENT', 'CONFIRMED');

