ALTER TABLE "rate_plans" ADD COLUMN "overstay_rate_kobo" bigint;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN "overstay_grace_min" integer;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_overstay_check" CHECK (("rate_plans"."overstay_rate_kobo" is null or "rate_plans"."overstay_rate_kobo" > 0)
        and ("rate_plans"."overstay_grace_min" is null or "rate_plans"."overstay_grace_min" between 10 and 240));