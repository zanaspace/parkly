import { describe, expect, it } from 'vitest';
import {
  addMonthsToDate,
  canReview,
  checkPermitDates,
  evaluateChecklist,
  permitExpiryAction,
  REQUIRED_VERIFICATION_ITEMS,
  validateRatePlan,
  verificationValidUntil,
  type ChecklistItem,
} from './review.js';

const NOW = new Date('2026-10-21T09:00:00Z');

describe('review workflow (permits, verifications, KYB, rate plans)', () => {
  it.each([
    ['SUBMITTED', true],
    ['IN_REVIEW', true],
    ['APPROVED', false],
    ['REJECTED', false],
    ['EXPIRED', false],
  ] as const)('a %s item can be decided: %s', (status, ok) => {
    expect(canReview(status)).toBe(ok);
  });
});

describe('verification checklist (FR-LOT-004)', () => {
  const passAll = (): ChecklistItem[] =>
    REQUIRED_VERIFICATION_ITEMS.map((item) => ({ item, result: 'PASS' as const }));

  it('requires permit, guard, lighting, capacity count and owner identity to pass', () => {
    expect([...REQUIRED_VERIFICATION_ITEMS]).toEqual([
      'LASPA_PERMIT',
      'GUARD_PRESENCE',
      'LIGHTING',
      'CAPACITY_COUNT',
      'OWNER_IDENTITY',
    ]);
    expect(evaluateChecklist(passAll())).toEqual({ passed: true, failed: [], missing: [] });
  });

  it('optional items may fail or be N/A', () => {
    expect(
      evaluateChecklist([
        ...passAll(),
        { item: 'CCTV', result: 'FAIL' },
        { item: 'FIRE_SAFETY', result: 'NA' },
      ]).passed,
    ).toBe(true);
  });

  it('fails when a required item fails, is N/A or is missing', () => {
    const items = passAll().filter((i) => i.item !== 'OWNER_IDENTITY');
    items[0] = { item: 'LASPA_PERMIT', result: 'FAIL' };
    items[1] = { item: 'GUARD_PRESENCE', result: 'NA' };
    expect(evaluateChecklist(items)).toEqual({
      passed: false,
      failed: ['LASPA_PERMIT', 'GUARD_PRESENCE'],
      missing: ['OWNER_IDENTITY'],
    });
  });

  it('is valid for 12 months from the inspection day (Lagos)', () => {
    expect(verificationValidUntil(new Date('2026-10-20T23:30:00Z'))).toBe('2027-10-21');
    expect(verificationValidUntil(new Date('2026-10-21T09:00:00Z'))).toBe('2027-10-21');
  });

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-10-21', 12, '2027-10-21'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2026-11-30', 3, '2027-02-28'],
  ])('addMonthsToDate(%s, %i) = %s (clamps to month end)', (date, months, expected) => {
    expect(addMonthsToDate(date, months)).toBe(expected);
  });
});

describe('permit dates (FR-LOT-003)', () => {
  it('accepts a permit that expires after it was issued and after today', () => {
    expect(checkPermitDates({ issuedOn: '2026-01-01', expiresOn: '2026-12-31', now: NOW })).toBe(
      null,
    );
  });
  it('rejects expiry on or before issue', () => {
    expect(checkPermitDates({ issuedOn: '2026-05-01', expiresOn: '2026-05-01', now: NOW })).toBe(
      'PERMIT_DATES_INVALID',
    );
  });
  it('rejects an already-expired permit with PERMIT_EXPIRED', () => {
    expect(checkPermitDates({ issuedOn: '2025-01-01', expiresOn: '2026-10-21', now: NOW })).toBe(
      'PERMIT_EXPIRED',
    );
  });
  it('rejects an issue date in the future', () => {
    expect(checkPermitDates({ issuedOn: '2026-10-22', expiresOn: '2027-10-22', now: NOW })).toBe(
      'PERMIT_DATES_INVALID',
    );
  });
});

describe('permitExpiryAction (FR-LOT-007: reminders 30/14/7/1, suspend at expiry)', () => {
  const today = NOW; // 2026-10-21 in Lagos
  it.each([
    ['2026-12-01', null, { kind: 'none' }],
    ['2026-11-20', null, { kind: 'remind', days: 30 }],
    ['2026-11-19', null, { kind: 'remind', days: 30 }],
    ['2026-11-19', 30, { kind: 'none' }],
    ['2026-11-04', 30, { kind: 'remind', days: 14 }],
    ['2026-10-28', 14, { kind: 'remind', days: 7 }],
    ['2026-10-28', 7, { kind: 'none' }],
    ['2026-10-22', 7, { kind: 'remind', days: 1 }],
    ['2026-10-22', 1, { kind: 'none' }],
    // A missed run sends only the nearest reminder, not every skipped one.
    ['2026-10-25', null, { kind: 'remind', days: 7 }],
    ['2026-10-21', 1, { kind: 'expire' }],
    ['2026-10-01', null, { kind: 'expire' }],
  ] as const)('expires %s, last reminder %s → %o', (expiresOn, last, expected) => {
    expect(permitExpiryAction({ expiresOn, lastReminderDays: last, now: today })).toEqual(expected);
  });
});

describe('validateRatePlan (FR-LOT-005)', () => {
  it('accepts a valid hourly plan', () => {
    expect(validateRatePlan({ product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 60 })).toEqual(
      [],
    );
  });
  it('accepts an hourly plan with a daily cap at or above one hour', () => {
    expect(
      validateRatePlan({
        product: 'HOURLY',
        hourlyRateKobo: 50_000,
        minMinutes: 60,
        dailyCapKobo: 300_000,
      }),
    ).toEqual([]);
  });
  it.each([
    [{ product: 'HOURLY', hourlyRateKobo: 0, minMinutes: 60 }, ['hourlyRateKobo']],
    [{ product: 'HOURLY', hourlyRateKobo: 500.5, minMinutes: 60 }, ['hourlyRateKobo']],
    [{ product: 'HOURLY', minMinutes: 60 }, ['hourlyRateKobo']],
    [{ product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 50 }, ['minMinutes']],
    [{ product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 0 }, ['minMinutes']],
    [
      { product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 60, dailyCapKobo: 40_000 },
      ['dailyCapKobo'],
    ],
    [{ product: 'DAILY' }, ['dailyRateKobo']],
    [{ product: 'DAILY', dailyRateKobo: -1 }, ['dailyRateKobo']],
    [{ product: 'MONTHLY', monthlyRateKobo: 0 }, ['monthlyRateKobo']],
  ] as const)('rejects %o', (plan, fields) => {
    expect(validateRatePlan(plan).map((e) => e.field)).toEqual(fields);
  });
  it('accepts daily and monthly plans', () => {
    expect(validateRatePlan({ product: 'DAILY', dailyRateKobo: 250_000 })).toEqual([]);
    expect(validateRatePlan({ product: 'MONTHLY', monthlyRateKobo: 4_500_000 })).toEqual([]);
  });

  describe('the operator overstay price (ADR 0016)', () => {
    const hourly = { product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 60 } as const;
    const rules = { overstayMaxMultiplier: 2, minGraceMin: 10 };

    it('allows no overstay price (hourly ÷ 4 is used), or one up to the Parkly maximum', () => {
      expect(validateRatePlan(hourly, rules)).toEqual([]);
      // ₦500/h → ₦125 per 15 minutes; 2× is ₦250.
      expect(validateRatePlan({ ...hourly, overstayRateKobo: 25_000 }, rules)).toEqual([]);
      expect(validateRatePlan({ ...hourly, overstayGraceMin: 30 }, rules)).toEqual([]);
    });

    it('refuses a price above the maximum, a non-positive price and a short grace', () => {
      const fields = (extra: object) =>
        validateRatePlan({ ...hourly, ...extra }, rules).map((e) => e.field);
      expect(fields({ overstayRateKobo: 25_001 })).toEqual(['overstayRateKobo']);
      expect(fields({ overstayRateKobo: 0 })).toEqual(['overstayRateKobo']);
      expect(fields({ overstayGraceMin: 5 })).toEqual(['overstayGraceMin']);
      expect(fields({ overstayGraceMin: 300 })).toEqual(['overstayGraceMin']);
    });

    it('keeps the platform defaults when no rules are passed', () => {
      expect(validateRatePlan({ ...hourly, overstayRateKobo: 25_001 }).map((e) => e.field)).toEqual(
        ['overstayRateKobo'],
      );
    });
  });
});
