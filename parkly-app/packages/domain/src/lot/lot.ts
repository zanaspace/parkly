import { lagosDateKey } from '../time/slots.js';

/**
 * Lot lifecycle (doc 00 §3.6, doc 02 §3.3). A lot can be LIVE only while it
 * has an APPROVED, unexpired permit, an APPROVED verification under 12 months
 * old, an ACTIVE rate plan and an active operator — the "listable" gate.
 */

export const LOT_STATUSES = [
  'DRAFT',
  'PENDING_VERIFICATION',
  'LIVE',
  'PAUSED',
  'SUSPENDED',
  'ARCHIVED',
] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export type LotActor =
  | 'OPERATOR_OWNER'
  | 'OPERATOR_MANAGER'
  | 'OPERATOR_ATTENDANT'
  | 'ADMIN_OPS'
  | 'ADMIN_COMPLIANCE'
  | 'SUPER_ADMIN'
  | 'SYSTEM';

/** FR-LOT-002: a lot needs 3–10 photos. */
export const MIN_LOT_PHOTOS = 3;
export const MAX_LOT_PHOTOS = 10;

// --- listability ---------------------------------------------------------------

export type ReviewStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type PermitStatus = ReviewStatus | 'EXPIRED';

/** Dates are calendar days (`YYYY-MM-DD`) in Africa/Lagos. */
export type PermitFacts = { status: PermitStatus; expiresOn: string } | null;
export type VerificationFacts = { status: ReviewStatus; validUntil: string } | null;

export type ListingProblem =
  | 'PERMIT_MISSING'
  | 'PERMIT_NOT_APPROVED'
  | 'PERMIT_EXPIRED'
  | 'VERIFICATION_MISSING'
  | 'VERIFICATION_NOT_APPROVED'
  | 'VERIFICATION_STALE'
  | 'NO_ACTIVE_RATE_PLAN'
  | 'OPERATOR_NOT_ACTIVE';

export type Listability = { listable: boolean; problems: ListingProblem[] };

export type ListabilityInput = {
  permit: PermitFacts;
  verification: VerificationFacts;
  hasActiveRatePlan: boolean;
  /** Operator KYB approved and not suspended (doc 03 §2.4 go-live invariant). */
  operatorActive: boolean;
  now: Date;
};

/**
 * Why a lot may or may not be shown to drivers. A permit or verification is
 * no longer valid on its expiry / valid-until date itself (Lagos calendar day).
 */
export function listability(input: ListabilityInput): Listability {
  const today = lagosDateKey(input.now);
  const problems: ListingProblem[] = [];

  const { permit, verification } = input;
  if (!permit) problems.push('PERMIT_MISSING');
  else if (
    permit.status === 'EXPIRED' ||
    (permit.status === 'APPROVED' && permit.expiresOn <= today)
  )
    problems.push('PERMIT_EXPIRED');
  else if (permit.status !== 'APPROVED') problems.push('PERMIT_NOT_APPROVED');

  if (!verification) problems.push('VERIFICATION_MISSING');
  else if (verification.status !== 'APPROVED') problems.push('VERIFICATION_NOT_APPROVED');
  else if (verification.validUntil <= today) problems.push('VERIFICATION_STALE');

  if (!input.hasActiveRatePlan) problems.push('NO_ACTIVE_RATE_PLAN');
  if (!input.operatorActive) problems.push('OPERATOR_NOT_ACTIVE');

  return { listable: problems.length === 0, problems };
}

/** Doc 20 S2 task 4: the single gate every path to LIVE goes through. */
export function canGoLive(input: ListabilityInput): boolean {
  return listability(input).listable;
}

// --- submission ------------------------------------------------------------------

export type SubmissionGap =
  'PROFILE' | 'PHOTOS' | 'OPENING_HOURS' | 'RATE_PLAN' | 'PERMIT' | 'PAYOUT_ACCOUNT';

/** What an operator must finish before a DRAFT lot can be submitted for verification. */
export function submissionGaps(input: {
  profileComplete: boolean;
  photoCount: number;
  hasOpeningHours: boolean;
  /** A rate plan awaiting approval or already active. */
  hasRatePlan: boolean;
  /** A permit that is submitted, in review or approved, and not expired. */
  permitSubmitted: boolean;
  payoutAccountVerified: boolean;
}): SubmissionGap[] {
  const gaps: SubmissionGap[] = [];
  if (!input.profileComplete) gaps.push('PROFILE');
  if (input.photoCount < MIN_LOT_PHOTOS) gaps.push('PHOTOS');
  if (!input.hasOpeningHours) gaps.push('OPENING_HOURS');
  if (!input.hasRatePlan) gaps.push('RATE_PLAN');
  if (!input.permitSubmitted) gaps.push('PERMIT');
  if (!input.payoutAccountVerified) gaps.push('PAYOUT_ACCOUNT');
  return gaps;
}

// --- transitions -------------------------------------------------------------------

type Guard = 'submission' | 'listable' | 'noFutureBookings';

type Rule = {
  actors: readonly LotActor[];
  guard?: Guard;
  /** Actors who must give a reason (it is shown to the operator and audited). */
  reasonFrom?: readonly LotActor[];
};

const OPERATOR: readonly LotActor[] = ['OPERATOR_OWNER', 'OPERATOR_MANAGER'];
const OPS: readonly LotActor[] = ['ADMIN_OPS', 'SUPER_ADMIN'];
const SUSPENDERS: readonly LotActor[] = ['SYSTEM', 'ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'];
const ARCHIVERS: readonly LotActor[] = [
  'OPERATOR_OWNER',
  'ADMIN_OPS',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
];
const HUMAN_ADMINS: readonly LotActor[] = ['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'];
const archive: Rule = { actors: ARCHIVERS, guard: 'noFutureBookings', reasonFrom: HUMAN_ADMINS };

const TRANSITIONS: Partial<Record<LotStatus, Partial<Record<LotStatus, Rule>>>> = {
  DRAFT: {
    PENDING_VERIFICATION: { actors: OPERATOR, guard: 'submission' },
    ARCHIVED: archive,
  },
  PENDING_VERIFICATION: {
    LIVE: { actors: OPS, guard: 'listable' },
    DRAFT: { actors: OPS, reasonFrom: OPS },
    ARCHIVED: archive,
  },
  LIVE: {
    PAUSED: { actors: OPERATOR },
    SUSPENDED: { actors: SUSPENDERS, reasonFrom: HUMAN_ADMINS },
  },
  PAUSED: {
    LIVE: { actors: OPERATOR, guard: 'listable' },
    SUSPENDED: { actors: SUSPENDERS, reasonFrom: HUMAN_ADMINS },
    ARCHIVED: archive,
  },
  SUSPENDED: {
    LIVE: { actors: OPS, guard: 'listable', reasonFrom: OPS },
    ARCHIVED: archive,
  },
};

export type LotFacts = {
  submissionGaps: SubmissionGap[];
  listability: Listability;
  hasFutureBookings: boolean;
};

export type LotTransitionError =
  | 'INVALID_STATE_TRANSITION'
  | 'FORBIDDEN'
  | 'REASON_REQUIRED'
  | 'LOT_INCOMPLETE'
  | 'LOT_PERMIT_INVALID'
  | 'LOT_NOT_LISTABLE'
  | 'LOT_HAS_FUTURE_BOOKINGS';

export type LotTransitionResult =
  { ok: true } | { ok: false; code: LotTransitionError; missing?: string[] };

const PERMIT_PROBLEMS = new Set<ListingProblem>([
  'PERMIT_MISSING',
  'PERMIT_NOT_APPROVED',
  'PERMIT_EXPIRED',
]);

/** Checks one status change against the transition table and its guard. */
export function checkLotTransition(input: {
  from: LotStatus;
  to: LotStatus;
  actor: LotActor;
  reason?: string | null;
  facts: LotFacts;
}): LotTransitionResult {
  const rule = TRANSITIONS[input.from]?.[input.to];
  if (!rule) return { ok: false, code: 'INVALID_STATE_TRANSITION' };
  if (!rule.actors.includes(input.actor)) return { ok: false, code: 'FORBIDDEN' };
  if (rule.reasonFrom?.includes(input.actor) && !input.reason?.trim())
    return { ok: false, code: 'REASON_REQUIRED' };

  const { facts } = input;
  switch (rule.guard) {
    case 'submission':
      if (facts.submissionGaps.length > 0)
        return { ok: false, code: 'LOT_INCOMPLETE', missing: facts.submissionGaps };
      break;
    case 'listable': {
      const { problems } = facts.listability;
      if (problems.length > 0) {
        const permitProblems = problems.filter((p) => PERMIT_PROBLEMS.has(p));
        return permitProblems.length > 0
          ? { ok: false, code: 'LOT_PERMIT_INVALID', missing: permitProblems }
          : { ok: false, code: 'LOT_NOT_LISTABLE', missing: problems };
      }
      break;
    }
    case 'noFutureBookings':
      if (facts.hasFutureBookings) return { ok: false, code: 'LOT_HAS_FUTURE_BOOKINGS' };
      break;
    case undefined:
      break;
  }
  return { ok: true };
}
