-- Hand-written. Sprint 4: the API reads and adds lot QR signing keys (ADR 0007).
-- Rows are never deleted: a key is retired or revoked, so old tickets can be checked.
grant select, insert, update on public.lot_signing_keys to parkly_api;
comment on table public.lot_signing_keys is
  'C1 public key, C4 private key (app-level envelope encrypted). Ed25519 per lot for offline QR tickets.';
