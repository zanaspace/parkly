import type { RefundRequest, RefundRequestList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { FinanceTabs } from '../../../../components/finance-tabs';
import { RefundDecision } from '../../../../components/refund-decision';
import { apiFetch } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { lagosShort } from '../../../../lib/bookings/support';
import { publicEnv } from '../../../../lib/env';
import { formatKobo } from '../../../../lib/lots/copy';

export const metadata = { title: 'Refund approvals · Parkly Admin' };

const REFUNDERS = new Set(['ADMIN_FINANCE', 'SUPER_ADMIN']);
const REASON: Record<string, string> = {
  OPS_GOODWILL: 'Goodwill',
  LOT_UNAVAILABLE: 'Car park couldn’t take the car',
  DUPLICATE: 'Charged twice',
  OTHER: 'Other',
};
const STATUS: Record<RefundRequest['status'], string> = {
  PENDING_APPROVAL: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FAILED: 'Failed: not enough left',
};

/**
 * FR-ADM-003 maker-checker: refunds over the limit wait here for a second
 * finance admin. The one who asked can't decide their own request.
 */
export default async function RefundApprovalsPage() {
  const { me, accessToken } = await requireAccess();
  const allowed = me.roles.some((r) => REFUNDERS.has(r.role));
  const load = (q: string) =>
    apiFetch<RefundRequestList>(publicEnv().apiUrl, `/v1/admin/refund-requests${q}`, accessToken)
      .then((r) => r.items)
      .catch(() => null);
  const [pending, recent] = allowed
    ? await Promise.all([load('?status=PENDING_APPROVAL'), load('')])
    : [null, null];
  const decided = (recent ?? []).filter((r) => r.status !== 'PENDING_APPROVAL').slice(0, 20);

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <div>
        <Text variant="heading-xl">Refund approvals</Text>
        <Text variant="body-sm" tone="secondary">
          Refunds over the limit need a second finance admin. You can’t approve your own.
        </Text>
      </div>

      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only finance and super admins approve refunds.</Text>
        </div>
      ) : (
        <>
          <FinanceTabs active="refunds" />
          {pending === null ? (
            <Text role="status" tone="secondary">
              We couldn’t load requests just now. Please refresh to try again.
            </Text>
          ) : pending.length === 0 ? (
            <div className="pk-card">
              <Text>Nothing waiting for approval.</Text>
            </div>
          ) : (
            <ul className="pk-list pk-rates">
              {pending.map((r) => (
                <li key={r.id} className="pk-card pk-stack">
                  <div className="pk-rates-summary">
                    <span>
                      <strong>{formatKobo(r.amountKobo)}</strong> ·{' '}
                      <Link className="pk-link" href={`/bookings/${r.bookingId}`}>
                        {r.bookingCode}
                      </Link>{' '}
                      · {REASON[r.reason] ?? r.reason}
                    </span>
                    <Text as="span" variant="body-sm" tone="secondary">
                      Asked by {r.requestedByName ?? 'a finance admin'} · {lagosShort(r.createdAt)}
                    </Text>
                  </div>
                  <Text variant="body-sm">{r.note}</Text>
                  {r.requestedBy === me.id ? (
                    <Text variant="body-sm" tone="tertiary">
                      You asked for this one, so another finance admin has to decide it.
                    </Text>
                  ) : (
                    <RefundDecision requestId={r.id} idempotencyKey={randomUUID()} />
                  )}
                </li>
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <section aria-labelledby="decided-heading" className="pk-stack">
              <Text variant="heading-md" as="h2" id="decided-heading">
                Recently decided
              </Text>
              <div className="pk-table-wrap">
                <table className="pk-table">
                  <thead>
                    <tr>
                      <th scope="col">Booking</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Decided</th>
                      <th scope="col">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decided.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link className="pk-link" href={`/bookings/${r.bookingId}`}>
                            {r.bookingCode}
                          </Link>
                        </td>
                        <td>{formatKobo(r.amountKobo)}</td>
                        <td>{STATUS[r.status]}</td>
                        <td>{r.decidedAt ? lagosShort(r.decidedAt) : '—'}</td>
                        <td>{r.decisionNote ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
