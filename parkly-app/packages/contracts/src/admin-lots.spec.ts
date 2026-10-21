import { listability, VERIFICATION_ITEMS } from '@parkly/domain/lot';
import { describe, expect, it } from 'vitest';
import {
  AdminLotListQuerySchema,
  AdminLotStatusRequestSchema,
  CreateVerificationRequestSchema,
  ListingProblemSchema,
  PermitReviewRequestSchema,
  VerificationItemSchema,
} from './admin-lots.js';

const visit = {
  inspectedAt: '2026-10-20T10:00:00.000Z',
  capacityCounted: 110,
  items: [
    { item: 'LASPA_PERMIT', result: 'PASS' },
    { item: 'CCTV', result: 'NA', comment: 'No cameras yet' },
  ],
};

describe('admin lot review contracts (FR-LOT-004, FR-LOT-006)', () => {
  it('matches the domain checklist items and listing problems', () => {
    expect(VerificationItemSchema.options).toEqual([...VERIFICATION_ITEMS]);
    const { problems } = listability({
      permit: null,
      verification: null,
      hasActiveRatePlan: false,
      operatorActive: false,
      now: new Date('2026-10-21T09:00:00Z'),
    });
    for (const p of problems) expect(ListingProblemSchema.safeParse(p).success, p).toBe(true);
  });

  it('accepts a site visit and refuses one that repeats an item or counts no spaces', () => {
    expect(CreateVerificationRequestSchema.safeParse(visit).success).toBe(true);
    const repeated = { ...visit, items: [...visit.items, { item: 'CCTV', result: 'PASS' }] };
    expect(CreateVerificationRequestSchema.safeParse(repeated).success).toBe(false);
    expect(
      CreateVerificationRequestSchema.safeParse({ ...visit, capacityCounted: 0 }).success,
    ).toBe(false);
  });

  it('needs the LASPA check note to approve a permit and a reason to reject it', () => {
    expect(PermitReviewRequestSchema.safeParse({ decision: 'APPROVE' }).success).toBe(false);
    expect(
      PermitReviewRequestSchema.safeParse({ decision: 'APPROVE', note: 'Phoned LASPA, ref 4471' })
        .success,
    ).toBe(true);
    expect(PermitReviewRequestSchema.safeParse({ decision: 'REJECT', reason: 'x' }).success).toBe(
      false,
    );
  });

  it('defaults the queue to lots waiting for verification and only allows admin moves', () => {
    expect(AdminLotListQuerySchema.parse({}).status).toBe('PENDING_VERIFICATION');
    expect(AdminLotStatusRequestSchema.safeParse({ status: 'LIVE' }).success).toBe(true);
    expect(AdminLotStatusRequestSchema.safeParse({ status: 'PAUSED' }).success).toBe(false);
  });
});
