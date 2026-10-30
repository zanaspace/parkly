import type { ListingProblem, RatePlan, VerificationItem } from '@parkly/contracts';

/** Doc 03 §4.1 checklist, in the order the inspector walks the site. */
export const CHECKLIST: { item: VerificationItem; label: string; required: boolean }[] = [
  { item: 'LASPA_PERMIT', label: 'LASPA permit displayed and matches', required: true },
  { item: 'OWNER_IDENTITY', label: 'Owner or manager identity checked', required: true },
  { item: 'GUARD_PRESENCE', label: 'Guard on duty', required: true },
  { item: 'LIGHTING', label: 'Lighting after dark', required: true },
  { item: 'CAPACITY_COUNT', label: 'Spaces counted', required: true },
  { item: 'CCTV', label: 'CCTV', required: false },
  { item: 'ACCESS_CONTROL', label: 'Access control (gate, barrier)', required: false },
  { item: 'ENTRANCE_SIGNAGE', label: 'Entrance signage', required: false },
  { item: 'FIRE_SAFETY', label: 'Fire safety', required: false },
];

export const CHECK_LABEL = Object.fromEntries(CHECKLIST.map((c) => [c.item, c.label])) as Record<
  VerificationItem,
  string
>;

export const PROBLEM_TEXT: Record<ListingProblem, string> = {
  PERMIT_MISSING: 'No LASPA permit',
  PERMIT_NOT_APPROVED: 'Permit not approved yet',
  PERMIT_EXPIRED: 'Permit expired',
  VERIFICATION_MISSING: 'No site visit recorded',
  VERIFICATION_NOT_APPROVED: 'Site visit not approved yet',
  VERIFICATION_STALE: 'Site visit older than 12 months',
  NO_ACTIVE_RATE_PLAN: 'No approved price',
  OPERATOR_NOT_ACTIVE: 'Operator KYB not approved, or operator suspended',
};

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
});

/** Kobo are integers (doc 00 §3.4); this only formats them for display. */
export const formatKobo = (kobo: number) => naira.format(kobo / 100);

export function describePrice(plan: RatePlan): string {
  switch (plan.product) {
    case 'HOURLY': {
      const cap = plan.dailyCapKobo ? `, capped at ${formatKobo(plan.dailyCapKobo)} a day` : '';
      const overstay =
        plan.overstayRateKobo || plan.overstayGraceMin
          ? `; overstay ${plan.overstayRateKobo ? formatKobo(plan.overstayRateKobo) : 'hourly ÷ 4'} per 15 min after ${plan.overstayGraceMin ?? 10} min grace`
          : '';
      return `${formatKobo(plan.hourlyRateKobo ?? 0)} an hour, minimum ${plan.minMinutes} min${cap}${overstay}`;
    }
    case 'DAILY':
      return `${formatKobo(plan.dailyRateKobo ?? 0)} a day`;
    case 'MONTHLY':
      return `${formatKobo(plan.monthlyRateKobo ?? 0)} a month`;
  }
}

/**
 * `datetime-local` gives a wall-clock time with no zone. Inspectors are in
 * Lagos (UTC+1, no daylight saving), so read it as Lagos time.
 */
export function lagosLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const at = new Date(`${local}:00+01:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
