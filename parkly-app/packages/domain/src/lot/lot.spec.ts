import { describe, expect, it } from 'vitest';
import {
  canGoLive,
  checkLotTransition,
  listability,
  LOT_STATUSES,
  MIN_LOT_PHOTOS,
  submissionGaps,
  type LotActor,
  type LotFacts,
  type LotStatus,
} from './lot.js';

const NOW = new Date('2026-10-21T09:00:00Z'); // 10:00 in Lagos

const goodPermit = { status: 'APPROVED', expiresOn: '2027-06-30' } as const;
const goodVerification = { status: 'APPROVED', validUntil: '2027-03-01' } as const;
const listable = listability({
  permit: goodPermit,
  verification: goodVerification,
  hasActiveRatePlan: true,
  operatorActive: true,
  now: NOW,
});
const notListable = listability({
  permit: null,
  verification: goodVerification,
  hasActiveRatePlan: true,
  operatorActive: true,
  now: NOW,
});
const facts: LotFacts = { submissionGaps: [], listability: listable, hasFutureBookings: false };

describe('listability — the LIVE gate (doc 00 §3.6, FR-LOT-003/004)', () => {
  it('is listable with an approved, unexpired permit, a valid verification and an active rate plan', () => {
    expect(listable).toEqual({ listable: true, problems: [] });
    expect(
      canGoLive({
        permit: goodPermit,
        verification: goodVerification,
        hasActiveRatePlan: true,
        operatorActive: true,
        now: NOW,
      }),
    ).toBe(true);
  });

  // Truth table: every permit × verification × rate plan combination.
  const permits = {
    none: null,
    submitted: { status: 'SUBMITTED', expiresOn: '2027-06-30' },
    rejected: { status: 'REJECTED', expiresOn: '2027-06-30' },
    expiredStatus: { status: 'EXPIRED', expiresOn: '2026-10-01' },
    approvedPastDate: { status: 'APPROVED', expiresOn: '2026-10-20' },
    approvedToday: { status: 'APPROVED', expiresOn: '2026-10-21' },
    approved: goodPermit,
  } as const;
  const verifications = {
    none: null,
    inReview: { status: 'IN_REVIEW', validUntil: '2027-03-01' },
    rejected: { status: 'REJECTED', validUntil: '2027-03-01' },
    stale: { status: 'APPROVED', validUntil: '2026-10-21' },
    approved: goodVerification,
  } as const;

  for (const [pName, permit] of Object.entries(permits)) {
    for (const [vName, verification] of Object.entries(verifications)) {
      for (const hasActiveRatePlan of [true, false]) {
        const expected = pName === 'approved' && vName === 'approved' && hasActiveRatePlan;
        it(`permit=${pName} verification=${vName} ratePlan=${hasActiveRatePlan} → ${expected}`, () => {
          expect(
            canGoLive({ permit, verification, hasActiveRatePlan, operatorActive: true, now: NOW }),
          ).toBe(expected);
        });
      }
    }
  }

  it('names each problem so the API can explain it', () => {
    expect(
      listability({
        permit: { status: 'APPROVED', expiresOn: '2026-10-01' },
        verification: { status: 'APPROVED', validUntil: '2026-01-01' },
        hasActiveRatePlan: false,
        operatorActive: true,
        now: NOW,
      }).problems,
    ).toEqual(['PERMIT_EXPIRED', 'VERIFICATION_STALE', 'NO_ACTIVE_RATE_PLAN']);
    expect(
      listability({
        permit: null,
        verification: null,
        hasActiveRatePlan: true,
        operatorActive: true,
        now: NOW,
      }).problems,
    ).toEqual(['PERMIT_MISSING', 'VERIFICATION_MISSING']);
    expect(
      listability({
        permit: { status: 'REJECTED', expiresOn: '2027-01-01' },
        verification: { status: 'SUBMITTED', validUntil: '2027-01-01' },
        hasActiveRatePlan: true,
        operatorActive: true,
        now: NOW,
      }).problems,
    ).toEqual(['PERMIT_NOT_APPROVED', 'VERIFICATION_NOT_APPROVED']);
  });

  it('hides lots of an operator whose KYB is not approved or who is suspended (doc 03 §2.4)', () => {
    const result = listability({
      permit: goodPermit,
      verification: goodVerification,
      hasActiveRatePlan: true,
      operatorActive: false,
      now: NOW,
    });
    expect(result).toEqual({ listable: false, problems: ['OPERATOR_NOT_ACTIVE'] });
    expect(
      checkLotTransition({
        from: 'PENDING_VERIFICATION',
        to: 'LIVE',
        actor: 'ADMIN_OPS',
        facts: { ...facts, listability: result },
      }),
    ).toEqual({ ok: false, code: 'LOT_NOT_LISTABLE', missing: ['OPERATOR_NOT_ACTIVE'] });
  });

  it('treats the expiry date itself as expired, in Lagos time', () => {
    // 23:30 UTC on the 20th is already 00:30 on the 21st in Lagos.
    const lateNight = new Date('2026-10-20T23:30:00Z');
    const permit = { status: 'APPROVED', expiresOn: '2026-10-21' } as const;
    expect(
      canGoLive({
        permit,
        verification: goodVerification,
        hasActiveRatePlan: true,
        operatorActive: true,
        now: lateNight,
      }),
    ).toBe(false);
    expect(
      canGoLive({
        permit,
        verification: goodVerification,
        hasActiveRatePlan: true,
        operatorActive: true,
        now: new Date('2026-10-20T22:59:59Z'),
      }),
    ).toBe(true);
  });
});

describe('submissionGaps (DRAFT → PENDING_VERIFICATION guard, doc 02 §3.3)', () => {
  const complete = {
    profileComplete: true,
    photoCount: MIN_LOT_PHOTOS,
    hasOpeningHours: true,
    hasRatePlan: true,
    permitSubmitted: true,
    payoutAccountVerified: true,
  };

  it('is empty when everything is in place', () => {
    expect(submissionGaps(complete)).toEqual([]);
  });

  it('requires at least 3 photos (FR-LOT-002)', () => {
    expect(MIN_LOT_PHOTOS).toBe(3);
    expect(submissionGaps({ ...complete, photoCount: 2 })).toEqual(['PHOTOS']);
  });

  it('lists every missing item', () => {
    expect(
      submissionGaps({
        profileComplete: false,
        photoCount: 0,
        hasOpeningHours: false,
        hasRatePlan: false,
        permitSubmitted: false,
        payoutAccountVerified: false,
      }),
    ).toEqual(['PROFILE', 'PHOTOS', 'OPENING_HOURS', 'RATE_PLAN', 'PERMIT', 'PAYOUT_ACCOUNT']);
  });
});

describe('checkLotTransition (doc 02 §3.3)', () => {
  const allowed: [LotStatus, LotStatus, LotActor][] = [
    ['DRAFT', 'PENDING_VERIFICATION', 'OPERATOR_OWNER'],
    ['DRAFT', 'PENDING_VERIFICATION', 'OPERATOR_MANAGER'],
    ['PENDING_VERIFICATION', 'LIVE', 'ADMIN_OPS'],
    ['PENDING_VERIFICATION', 'LIVE', 'SUPER_ADMIN'],
    ['PENDING_VERIFICATION', 'DRAFT', 'ADMIN_OPS'],
    ['LIVE', 'PAUSED', 'OPERATOR_OWNER'],
    ['LIVE', 'PAUSED', 'OPERATOR_MANAGER'],
    ['PAUSED', 'LIVE', 'OPERATOR_OWNER'],
    ['LIVE', 'SUSPENDED', 'SYSTEM'],
    ['LIVE', 'SUSPENDED', 'ADMIN_OPS'],
    ['LIVE', 'SUSPENDED', 'ADMIN_COMPLIANCE'],
    ['PAUSED', 'SUSPENDED', 'SYSTEM'],
    ['SUSPENDED', 'LIVE', 'ADMIN_OPS'],
    ['DRAFT', 'ARCHIVED', 'OPERATOR_OWNER'],
    ['PAUSED', 'ARCHIVED', 'ADMIN_OPS'],
    ['SUSPENDED', 'ARCHIVED', 'ADMIN_COMPLIANCE'],
  ];

  it.each(allowed)('%s → %s by %s is allowed', (from, to, actor) => {
    expect(checkLotTransition({ from, to, actor, reason: 'because', facts })).toEqual({
      ok: true,
    });
  });

  it('rejects every transition not in the table with INVALID_STATE_TRANSITION', () => {
    const listed = new Set(
      [
        'DRAFT>PENDING_VERIFICATION',
        'PENDING_VERIFICATION>LIVE',
        'PENDING_VERIFICATION>DRAFT',
        'LIVE>PAUSED',
        'PAUSED>LIVE',
        'LIVE>SUSPENDED',
        'PAUSED>SUSPENDED',
        'SUSPENDED>LIVE',
      ].concat(
        LOT_STATUSES.filter((s) => s !== 'LIVE' && s !== 'ARCHIVED').map((s) => `${s}>ARCHIVED`),
      ),
    );
    for (const from of LOT_STATUSES) {
      for (const to of LOT_STATUSES) {
        if (listed.has(`${from}>${to}`)) continue;
        expect(
          checkLotTransition({ from, to, actor: 'SUPER_ADMIN', reason: 'x', facts }),
          `${from} → ${to}`,
        ).toEqual({ ok: false, code: 'INVALID_STATE_TRANSITION' });
      }
    }
  });

  it.each([
    ['DRAFT', 'PENDING_VERIFICATION', 'ADMIN_OPS'],
    ['PENDING_VERIFICATION', 'LIVE', 'OPERATOR_OWNER'],
    ['PENDING_VERIFICATION', 'LIVE', 'ADMIN_COMPLIANCE'],
    ['LIVE', 'PAUSED', 'OPERATOR_ATTENDANT'],
    ['LIVE', 'SUSPENDED', 'OPERATOR_OWNER'],
    ['SUSPENDED', 'LIVE', 'OPERATOR_OWNER'],
    ['DRAFT', 'ARCHIVED', 'OPERATOR_MANAGER'],
    ['LIVE', 'PAUSED', 'SYSTEM'],
  ] as [LotStatus, LotStatus, LotActor][])('%s → %s by %s is forbidden', (from, to, actor) => {
    expect(checkLotTransition({ from, to, actor, reason: 'x', facts })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('blocks submission while items are missing and lists them', () => {
    expect(
      checkLotTransition({
        from: 'DRAFT',
        to: 'PENDING_VERIFICATION',
        actor: 'OPERATOR_OWNER',
        facts: { ...facts, submissionGaps: ['PHOTOS', 'PERMIT'] },
      }),
    ).toEqual({ ok: false, code: 'LOT_INCOMPLETE', missing: ['PHOTOS', 'PERMIT'] });
  });

  it('fails with LOT_PERMIT_INVALID when the permit is the problem (FR-LOT-003)', () => {
    for (const [from, actor] of [
      ['PENDING_VERIFICATION', 'ADMIN_OPS'],
      ['PAUSED', 'OPERATOR_OWNER'],
      ['SUSPENDED', 'ADMIN_OPS'],
    ] as [LotStatus, LotActor][]) {
      expect(
        checkLotTransition({
          from,
          to: 'LIVE',
          actor,
          reason: 'x',
          facts: { ...facts, listability: notListable },
        }),
      ).toEqual({ ok: false, code: 'LOT_PERMIT_INVALID', missing: ['PERMIT_MISSING'] });
    }
  });

  it('fails with LOT_NOT_LISTABLE for other listing problems', () => {
    const noRatePlan = listability({
      permit: goodPermit,
      verification: goodVerification,
      hasActiveRatePlan: false,
      operatorActive: true,
      now: NOW,
    });
    expect(
      checkLotTransition({
        from: 'PENDING_VERIFICATION',
        to: 'LIVE',
        actor: 'ADMIN_OPS',
        facts: { ...facts, listability: noRatePlan },
      }),
    ).toEqual({ ok: false, code: 'LOT_NOT_LISTABLE', missing: ['NO_ACTIVE_RATE_PLAN'] });
  });

  it.each([
    ['PENDING_VERIFICATION', 'DRAFT', 'ADMIN_OPS'],
    ['LIVE', 'SUSPENDED', 'ADMIN_COMPLIANCE'],
    ['SUSPENDED', 'LIVE', 'ADMIN_OPS'],
    ['PAUSED', 'ARCHIVED', 'ADMIN_OPS'],
  ] as [LotStatus, LotStatus, LotActor][])('%s → %s by %s needs a reason', (from, to, actor) => {
    expect(checkLotTransition({ from, to, actor, reason: '  ', facts })).toEqual({
      ok: false,
      code: 'REASON_REQUIRED',
    });
  });

  it('does not archive a lot with future bookings', () => {
    expect(
      checkLotTransition({
        from: 'PAUSED',
        to: 'ARCHIVED',
        actor: 'OPERATOR_OWNER',
        facts: { ...facts, hasFutureBookings: true },
      }),
    ).toEqual({ ok: false, code: 'LOT_HAS_FUTURE_BOOKINGS' });
  });

  it('lets the system suspend without a human reason', () => {
    expect(checkLotTransition({ from: 'LIVE', to: 'SUSPENDED', actor: 'SYSTEM', facts })).toEqual({
      ok: true,
    });
  });
});
