-- FR-ADM-002: support finds bookings by plate, newest first.
CREATE INDEX "bookings_plate_start_idx" ON "bookings" USING btree ("plate_norm_snapshot","start_at" DESC NULLS LAST);