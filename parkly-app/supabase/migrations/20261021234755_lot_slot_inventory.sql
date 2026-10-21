CREATE TABLE "lot_slot_inventory" (
	"lot_id" uuid NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"booked" integer DEFAULT 0 NOT NULL,
	"held" integer DEFAULT 0 NOT NULL,
	"pass_reserved" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lot_slot_inventory_lot_id_slot_start_pk" PRIMARY KEY("lot_id","slot_start"),
	CONSTRAINT "lot_slot_inventory_slot_check" CHECK (extract(epoch from "lot_slot_inventory"."slot_start")::bigint % 900 = 0),
	CONSTRAINT "lot_slot_inventory_counts_check" CHECK ("lot_slot_inventory"."capacity" >= 0 and "lot_slot_inventory"."booked" >= 0 and "lot_slot_inventory"."held" >= 0 and "lot_slot_inventory"."pass_reserved" >= 0 and "lot_slot_inventory"."blocked" >= 0),
	CONSTRAINT "lot_slot_inventory_capacity_check" CHECK ("lot_slot_inventory"."booked" + "lot_slot_inventory"."held" + "lot_slot_inventory"."pass_reserved" + "lot_slot_inventory"."blocked" <= "lot_slot_inventory"."capacity")
);
--> statement-breakpoint
ALTER TABLE "lot_slot_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lot_slot_inventory" ADD CONSTRAINT "lot_slot_inventory_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "lot_slot_inventory_api_all" ON "lot_slot_inventory" AS PERMISSIVE FOR ALL TO "parkly_api" USING (true) WITH CHECK (true);