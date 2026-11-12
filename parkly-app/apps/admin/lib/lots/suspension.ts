import type { LotSuspensionImpact } from '@parkly/contracts';

// Mirrors the API's `lot:suspension:cancel-bookings` rule; the API enforces it.
const CANCELLERS = new Set(['ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN']);
export const canCancelUpcoming = (roles: { role: string }[]) =>
  roles.some((r) => CANCELLERS.has(r.role));

/** One line for the lot page: what suspending does to drivers who booked. */
export function impactSummary(
  i: Pick<LotSuspensionImpact, 'upcoming' | 'activeCount' | 'holdCount' | 'totalRefundKobo'>,
): string {
  const n = i.upcoming.length;
  const parts = [
    n === 0
      ? 'No paid bookings are waiting to start'
      : `${n} paid booking${n === 1 ? '' : 's'} waiting to start (₦${(i.totalRefundKobo / 100).toLocaleString('en-NG')} if all are refunded)`,
  ];
  if (i.activeCount > 0)
    parts.push(
      `${i.activeCount} car${i.activeCount === 1 ? '' : 's'} parked there now (always honoured)`,
    );
  if (i.holdCount > 0)
    parts.push(
      `${i.holdCount} unpaid hold${i.holdCount === 1 ? '' : 's'} (they lapse by themselves)`,
    );
  return `${parts.join('; ')}.`;
}
