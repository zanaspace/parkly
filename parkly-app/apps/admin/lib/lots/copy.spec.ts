import { describe, expect, it } from 'vitest';
import { ListingProblemSchema, VerificationItemSchema } from '@parkly/contracts';
import { CHECKLIST, describePrice, lagosLocalToIso, PROBLEM_TEXT } from './copy';

const plan = {
  id: '00000000-0000-4000-8000-000000000000',
  status: 'PENDING_APPROVAL' as const,
  hourlyRateKobo: null,
  minMinutes: 60,
  dailyCapKobo: null,
  dailyRateKobo: null,
  monthlyRateKobo: null,
  rejectionReason: null,
  submittedAt: '2026-10-21T10:00:00.000Z',
};

describe('lot review copy', () => {
  it('covers every checklist item once and every listing problem', () => {
    expect(CHECKLIST.map((c) => c.item).sort()).toEqual([...VerificationItemSchema.options].sort());
    for (const p of ListingProblemSchema.options) expect(PROBLEM_TEXT[p]).toBeTruthy();
  });

  it('describes prices in naira from kobo', () => {
    expect(
      describePrice({ ...plan, product: 'HOURLY', hourlyRateKobo: 50_000, dailyCapKobo: 300_000 }),
    ).toBe('₦500.00 an hour, minimum 60 min, capped at ₦3,000.00 a day');
    expect(describePrice({ ...plan, product: 'DAILY', dailyRateKobo: 250_050 })).toBe(
      '₦2,500.50 a day',
    );
    expect(describePrice({ ...plan, product: 'MONTHLY', monthlyRateKobo: 4_000_000 })).toBe(
      '₦40,000.00 a month',
    );
  });

  it('reads the visit time as Lagos time', () => {
    expect(lagosLocalToIso('2026-10-21T09:30')).toBe('2026-10-21T08:30:00.000Z');
    expect(lagosLocalToIso('yesterday')).toBeNull();
  });
});
