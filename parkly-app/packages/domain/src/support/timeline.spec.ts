import { describe, expect, it } from 'vitest';
import { buildTimeline } from './timeline.js';

const at = (hhmm: string) => new Date(`2026-11-07T${hhmm}:00Z`);

describe('booking timeline for support (FR-ADM-002)', () => {
  it('tells the story oldest first: checkout, paid, status, stay, overstay, refund', () => {
    const events = buildTimeline({
      history: [
        {
          from: 'PENDING_PAYMENT',
          to: 'CONFIRMED',
          actor: 'SYSTEM',
          reason: 'payment.succeeded',
          at: at('09:01'),
        },
        { from: null, to: 'PENDING_PAYMENT', actor: 'DRIVER', reason: null, at: at('09:00') },
      ],
      payments: [
        {
          kind: 'BOOKING',
          status: 'SUCCEEDED',
          amountKobo: 110_000,
          createdAt: at('09:00'),
          paidAt: at('09:01'),
          failureCode: null,
        },
      ],
      refunds: [
        { amountKobo: 10_000, status: 'SUCCEEDED', reason: 'OPS_GOODWILL', createdAt: at('13:00') },
      ],
      session: {
        checkInAt: at('10:00'),
        checkOutAt: at('12:30'),
        overstayMinutes: 30,
        overstayAmountKobo: 25_000,
        overstayStatus: 'DUE',
      },
    });
    expect(events.map((e) => e.label)).toEqual([
      'Pending payment',
      'Booking checkout started',
      'Pending payment → confirmed',
      'Booking paid',
      'Checked in',
      'Checked out',
      'Overstay due',
      'Refund succeeded',
    ]);
    expect(events[2]).toMatchObject({ type: 'STATUS', detail: 'system: payment.succeeded' });
    expect(events.at(-1)).toMatchObject({
      type: 'REFUND',
      amountKobo: 10_000,
      detail: 'ops goodwill',
    });
  });

  it('shows a failed payment with its reason, and puts undated lines last', () => {
    const events = buildTimeline({
      history: [
        { from: 'PENDING_PAYMENT', to: 'EXPIRED', actor: 'SYSTEM', reason: null, at: null },
      ],
      payments: [
        {
          kind: 'BOOKING',
          status: 'FAILED',
          amountKobo: 110_000,
          createdAt: at('09:00'),
          paidAt: null,
          failureCode: 'WRONG_AMOUNT_REFUNDED',
        },
      ],
      refunds: [],
      session: null,
    });
    expect(events.map((e) => [e.label, e.detail])).toEqual([
      ['Booking checkout started', null],
      ['Pending payment → expired', 'system'],
      ['Booking failed', 'wrong amount refunded'],
    ]);
  });
});
