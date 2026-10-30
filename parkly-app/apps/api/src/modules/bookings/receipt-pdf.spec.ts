import type { BookingReceipt } from '@parkly/contracts';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { renderReceiptPdf } from './receipt-pdf.js';

const base: BookingReceipt = {
  bookingId: '0192f0a0-0000-7000-8000-000000000001',
  bookingCode: 'PK-ABC123',
  status: 'CANCELLED',
  receiptNumber: 'R-000042',
  revision: 3,
  issuedAt: '2026-10-20T06:05:00.000Z',
  revisedAt: '2026-10-20T08:00:00.000Z',
  issuer: { name: 'Ẹkọ Parking' },
  lot: {
    id: '0192f0a0-0000-7000-8000-000000000002',
    name: 'Lot 中央',
    addressLine: '1 Road',
    area: null,
    permitNumber: null,
  },
  vehicle: { plate: 'LND123XY' },
  driver: { firstName: null, lastName: null, phoneLast4: null },
  product: 'HOURLY',
  startAt: '2026-10-20T07:00:00.000Z',
  endAt: '2026-10-20T09:00:00.000Z',
  durationMinutes: 120,
  priceKobo: 100_000,
  serviceFeeKobo: 10_000,
  totalKobo: 110_000,
  lines: [],
  charges: [
    { kind: 'BOOKING', reference: 'pay_1', amountKobo: 110_000, paidAt: null },
    {
      kind: 'OVERSTAY',
      reference: 'pay_2',
      amountKobo: 25_000,
      paidAt: '2026-10-20T09:30:00.000Z',
    },
  ],
  totals: { chargedKobo: 135_000, refundedKobo: 50_000, refundPendingKobo: 10_000 },
  vat: { rateBps: 750, amountKobo: 5_930, number: null },
  payments: [],
  refunds: [],
};

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('receipt PDF', () => {
  it('draws refunds, VAT without a number, and names the font cannot print', async () => {
    const pdf = await renderReceiptPdf(base);
    expect(text(pdf).startsWith('%PDF-')).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('runs onto a second page when there are many charges', async () => {
    const charges = Array.from({ length: 80 }, (_, i) => ({
      kind: 'EXTENSION' as const,
      reference: `pay_${i}`,
      amountKobo: 1_000,
      paidAt: null,
    }));
    const one = await renderReceiptPdf({ ...base, vat: null, charges: charges.slice(0, 1) });
    const many = await renderReceiptPdf({ ...base, vat: null, charges });
    const pages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
    expect(await pages(one)).toBe(1);
    expect(await pages(many)).toBeGreaterThan(1);
  });
});
