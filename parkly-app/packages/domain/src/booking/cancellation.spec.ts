import { describe, expect, it } from 'vitest';
import type { Kobo } from '../money/money.js';
import {
  cancellationPolicy,
  cancellationRefundJournal,
  type CancellationInput,
  type CancellationSettings,
} from './cancellation.js';
import type { BookingPayment } from './ledger.js';

describe('cancellationPolicy (FR-BOOK-006, doc 02 §3.1, doc 19 §6.4)', () => {
  const settings: CancellationSettings = {
    freeCancellationLeadMin: 30, // 30 minutes before start
  };

  const startAt = new Date('2026-10-27T12:00:00Z');
  const priceKobo = 100_000 as Kobo; // ₦1,000
  const serviceFeeKobo = 10_000 as Kobo; // ₦100
  const totalKobo = 110_000 as Kobo; // ₦1,100

  it('grants full refund (including service fee) when driver cancels well before the lead window', () => {
    // 2 hours before start
    const now = new Date('2026-10-27T10:00:00Z');
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'CONFIRMED',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'DRIVER',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.isFreeCancellation).toBe(true);
    expect(res.refundKobo).toBe(110_000);
    expect(res.refundPriceKobo).toBe(100_000);
    expect(res.refundServiceFeeKobo).toBe(10_000);
    expect(res.reason).toBe('DRIVER_CANCEL');
  });

  it('grants full refund exactly at the 30-minute boundary', () => {
    // Exactly 30 minutes before start (11:30:00Z)
    const now = new Date('2026-10-27T11:30:00Z');
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'CONFIRMED',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'DRIVER',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.isFreeCancellation).toBe(true);
    expect(res.refundKobo).toBe(110_000);
    expect(res.reason).toBe('DRIVER_CANCEL');
  });

  it('cancels with 0 refund when driver cancels within the 30-minute cutoff (late cancellation)', () => {
    // 15 minutes before start (11:45:00Z)
    const now = new Date('2026-10-27T11:45:00Z');
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'CONFIRMED',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'DRIVER',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.isFreeCancellation).toBe(false);
    expect(res.refundKobo).toBe(0);
    expect(res.refundPriceKobo).toBe(0);
    expect(res.refundServiceFeeKobo).toBe(0);
    expect(res.reason).toBe('DRIVER_CANCEL');
  });

  it('cancels with 0 refund when driver cancels after the booking has already started', () => {
    // 10 minutes after start (12:10:00Z)
    const now = new Date('2026-10-27T12:10:00Z');
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'CONFIRMED',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'DRIVER',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.isFreeCancellation).toBe(false);
    expect(res.refundKobo).toBe(0);
  });

  it('allows ADMIN to cancel with full refund even after cutoff (ops goodwill)', () => {
    const now = new Date('2026-10-27T11:55:00Z'); // 5 min before start
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'CONFIRMED',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'ADMIN',
      overrideReason: 'OPS_GOODWILL',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.isFreeCancellation).toBe(false); // It's an administrative override
    expect(res.refundKobo).toBe(110_000);
    expect(res.reason).toBe('OPS_GOODWILL');
  });

  it('allows ADMIN to cancel with custom partial refund amount', () => {
    const now = new Date('2026-10-27T11:55:00Z');
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'CONFIRMED',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'ADMIN',
      overrideRefundKobo: 50_000 as Kobo, // Partial refund of ₦500
      overrideReason: 'LOT_UNAVAILABLE',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.refundKobo).toBe(50_000);
    expect(res.reason).toBe('LOT_UNAVAILABLE');
  });

  it('refuses cancellation if booking is already checked in, cancelled, or completed', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    for (const status of ['CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'] as const) {
      const res = cancellationPolicy({
        startAt,
        now,
        status,
        priceKobo,
        serviceFeeKobo,
        totalKobo,
        actor: 'DRIVER',
        settings,
      });
      expect(res.cancellable).toBe(false);
      expect(res.refundKobo).toBe(0);
    }
  });

  it('allows PENDING_PAYMENT hold cancellation with 0 refund', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    const res = cancellationPolicy({
      startAt,
      now,
      status: 'PENDING_PAYMENT',
      priceKobo,
      serviceFeeKobo,
      totalKobo,
      actor: 'DRIVER',
      settings,
    });

    expect(res.cancellable).toBe(true);
    expect(res.refundKobo).toBe(0);
    expect(res.reason).toBe('DRIVER_CANCEL');
  });
});

describe('cancellationRefundJournal', () => {
  const payment: BookingPayment = {
    provider: 'PAYSTACK',
    operatorId: '018f6c38-3b10-7e44-b0a7-21a4f001e7a0',
    priceKobo: 100_000 as Kobo,
    serviceFeeKobo: 10_000 as Kobo,
    commissionBps: 1200, // 12%
  };

  it('generates a balanced refund journal for full cancellation refund', () => {
    const journal = cancellationRefundJournal({
      payment,
      refundPriceKobo: 100_000 as Kobo,
      refundServiceFeeKobo: 10_000 as Kobo,
    });

    // Debit operator payable: 88,000 kobo
    // Debit platform commission: 12,000 kobo
    // Debit platform service fee: 10,000 kobo
    // Credit provider clearing (or refunds clearing): 110,000 kobo
    const debits = journal
      .filter((l) => l.direction === 'DEBIT')
      .reduce((s, l) => s + l.amountKobo, 0);
    const credits = journal
      .filter((l) => l.direction === 'CREDIT')
      .reduce((s, l) => s + l.amountKobo, 0);

    expect(debits).toBe(110_000);
    expect(credits).toBe(110_000);
  });

  it('returns empty journal if refund amount is 0', () => {
    const journal = cancellationRefundJournal({
      payment,
      refundPriceKobo: 0 as Kobo,
      refundServiceFeeKobo: 0 as Kobo,
    });
    expect(journal).toEqual([]);
  });
});
