import type { AdminOperatorSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'KYB to review · Parkly Admin' };

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
      <Link className="pk-link" href="/">
        ← Home
      </Link>
      <Text variant="heading-xl">KYB to review</Text>
      {(reviewed === 'approved' || reviewed === 'rejected') && (
        <p className="pk-notice pk-notice--info" role="status">
          KYB {reviewed}.
        </p>
      )}
      {items.length === 0 ? (
        <Text tone="secondary">Nothing waiting. New submissions appear here.</Text>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Submitted (Lagos)</th>
                <th scope="col">Bank name check</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link className="pk-link" href={`/kyb/${o.id}`}>
                      {o.legalName}
                    </Link>
                    <Text variant="body-sm" tone="tertiary">
                      {o.tradingName}
                    </Text>
                  </td>
                  <td>{o.kybSubmittedAt ? lagos.format(new Date(o.kybSubmittedAt)) : '—'}</td>
                  <td>{o.payoutNameMismatch ? '⚠ Differs from legal name' : 'Matches'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
