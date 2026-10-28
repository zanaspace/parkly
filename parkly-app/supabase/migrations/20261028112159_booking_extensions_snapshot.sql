-- Drizzle snapshot sync (gap review T-1). booking_extensions was created by the
-- hand-written 20261026210000 and extended by 20261028100000, so drizzle-kit's
-- generated CREATE TABLE is already applied. This file keeps the snapshot in
-- meta/ so `pnpm db:generate` reports no drift; the only change left is the
-- policy name drizzle expects.
alter policy "api_access" on public.booking_extensions rename to "booking_extensions_api_all";
