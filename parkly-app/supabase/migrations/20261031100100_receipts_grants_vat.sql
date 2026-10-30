-- Hand-written. Sprint 6, gap review L-5 (FR-BOOK-009): stored receipts.
grant select, insert, update on public.receipts, public.receipt_counters to parkly_api;

-- VAT on receipts is designed in but off until Parkly confirms its position.
-- Prices already include any VAT, so switching it on changes only what the
-- receipt shows. Also seeds the ADR 0016 overstay cap, which code defaulted.
insert into public.platform_settings (key, value, description) values
  ('fees.vat_enabled', 'false', 'Show the VAT included in prices on receipts'),
  ('fees.vat_rate_bps', '750', 'VAT rate in basis points (Nigeria: 7.5%)'),
  ('company.vat_number', 'null', 'Parkly''s VAT/TIN number printed on receipts when VAT is on'),
  ('fees.overstay_max_multiplier', '2', 'Operator overstay price per 15 min <= this x hourly / 4 (ADR 0016)')
on conflict (key) do nothing;
