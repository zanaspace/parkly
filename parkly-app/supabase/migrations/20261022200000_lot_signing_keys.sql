CREATE TYPE "public"."signing_key_status" AS ENUM('ACTIVE', 'RETIRING', 'REVOKED');--> statement-breakpoint
CREATE TABLE "lot_signing_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lot_id" uuid NOT NULL,
	"kid" varchar(40) NOT NULL,
	"public_key" "bytea" NOT NULL,
	"private_key_ciphertext" text NOT NULL,
	"status" "signing_key_status" DEFAULT 'ACTIVE' NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"retire_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lot_signing_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lot_signing_keys" ADD CONSTRAINT "lot_signing_keys_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lot_signing_keys_kid_key" ON "lot_signing_keys" USING btree ("kid");--> statement-breakpoint
CREATE UNIQUE INDEX "lot_signing_keys_active_key" ON "lot_signing_keys" USING btree ("lot_id") WHERE "lot_signing_keys"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "lot_signing_keys_lot_idx" ON "lot_signing_keys" USING btree ("lot_id");--> statement-breakpoint
CREATE POLICY "lot_signing_keys_api_all" ON "lot_signing_keys" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);