import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { MonthlyStatement } from '@parkly/contracts';
import { renderStatementPdf } from './statement-pdf.js';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('statement PDF generator (FR-OPS-006)', () => {
  const baseStatement: MonthlyStatement = {
    statementNumber: 'STM-202610-0001',
    month: '2026-10',
    operatorId: '0192e220-0000-7000-8000-000000000001',
    operatorName: 'Lekki Prime Parking Ltd',
    payoutAccount: {
      bankName: 'Access Bank',
      accountNumberLast4: '1234',
      accountName: 'Lekki Prime Parking Ltd',
    },
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    totals: {
      bookingsCount: 25,
      grossBookingKobo: 2_500_000,
      commissionKobo: 250_000,
      serviceFeeKobo: 50_000,
      netOperatorKobo: 2_250_000,
      settlementKobo: 2_000_000,
      closingBalanceKobo: 250_000,
    },
    lots: [
      {
        lotId: '0192e220-0000-7000-8000-000000000002',
        lotName: 'Admiralty Lot A',
        bookingsCount: 15,
        grossBookingKobo: 1_500_000,
        commissionKobo: 150_000,
        netOperatorKobo: 1_350_000,
      },
      {
        lotId: '0192e220-0000-7000-8000-000000000003',
        lotName: 'Admiralty Lot B',
        bookingsCount: 10,
        grossBookingKobo: 1_000_000,
        commissionKobo: 100_000,
        netOperatorKobo: 900_000,
      },
    ],
    settlements: [
      {
        id: '0192e220-0000-7000-8000-000000000004',
        providerSettlementId: 'SETTLE_PAY_001',
        amountKobo: 2_000_000,
        status: 'SETTLED',
        settledAt: '2026-10-15T10:00:00.000Z',
      },
    ],
    generatedAt: '2026-11-01T06:00:00.000Z',
  };

  it('renders a valid PDF document with header, tables, and footer', async () => {
    const pdf = await renderStatementPdf(baseStatement);
    expect(text(pdf).startsWith('%PDF-')).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe('Parkly Statement STM-202610-0001');
  });

  it('handles empty lots, no payout account, and no settlements gracefully', async () => {
    const minimal: MonthlyStatement = {
      ...baseStatement,
      payoutAccount: null,
      lots: [],
      settlements: [],
    };
    const pdf = await renderStatementPdf(minimal);
    expect(text(pdf).startsWith('%PDF-')).toBe(true);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  });
});
