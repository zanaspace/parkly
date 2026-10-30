import type { AdminOperatorSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'KYB Queue · Parkly Admin' };

const lagos = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

/** X-05: operators waiting for KYB review, oldest first. */
export default async function KybQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string }>;
}) {
  const { accessToken } = await requireAccess();
  const { reviewed } = await searchParams;
  const { items } = await apiFetch<{ items: AdminOperatorSummary[] }>(
    publicEnv().apiUrl,
    '/v1/admin/operators?kybStatus=SUBMITTED',
    accessToken,
  );

  return (
    <main className="pk-page pk-page--wide">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <Text variant="heading-xl">Operator KYB Queue</Text>
          <Text variant="body-sm" tone="secondary">
            Operators awaiting legal verification, CAC registration check, and settlement subaccount
            approval.
          </Text>
        </div>
        <span
          className="pk-badge pk-badge--submitted"
          style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}
        >
          {items.length} Pending
        </span>
      </div>

      {(reviewed === 'approved' || reviewed === 'rejected') && (
        <p className="pk-notice pk-notice--info" role="status">
          ✓ Operator KYB successfully {reviewed}.
        </p>
      )}

      {items.length === 0 ? (
        <div className="pk-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Text variant="heading-md">Queue is Clear</Text>
          <Text tone="secondary">
            There are currently no operators waiting for KYB verification.
          </Text>
        </div>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Business Entity</th>
                <th scope="col">Submission Date</th>
                <th scope="col">Bank Account Status</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link
                      className="pk-link"
                      href={`/kyb/${o.id}`}
                      style={{ fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}
                    >
                      {o.legalName}
                    </Link>
                    <Text variant="body-sm" tone="tertiary" style={{ display: 'block' }}>
                      Trading as: {o.tradingName || '—'}
                    </Text>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Text variant="body-sm">
                      {o.kybSubmittedAt ? lagos.format(new Date(o.kybSubmittedAt)) : '—'}
                    </Text>
                  </td>
                  <td>
                    {o.payoutNameMismatch ? (
                      <span className="pk-badge pk-badge--suspended">
                        ⚠ Differs from legal name
                      </span>
                    ) : (
                      <span className="pk-badge pk-badge--verified">✓ Name Matches</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      className="pk-nav-link pk-nav-link--active"
                      href={`/kyb/${o.id}`}
                      style={{ display: 'inline-flex' }}
                    >
                      Review Operator →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
