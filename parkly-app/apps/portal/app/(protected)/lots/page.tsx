import type { LotSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { lotOperatorId } from './operator';

export const metadata = { title: 'Lots · Parkly for Operators' };

const STATUS: Record<LotSummary['status'], string> = {
  DRAFT: 'Draft',
  PENDING_VERIFICATION: 'Awaiting verification',
  LIVE: 'Live',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

/** O-10: the operator's lots. */
export default async function LotsPage() {
  const { me, accessToken } = await requireAccess();
  const operatorId = lotOperatorId(me);
  if (!operatorId) return null;
  const { items } = await apiFetch<{ items: LotSummary[] }>(
    publicEnv().apiUrl,
    `/v1/operators/${operatorId}/lots`,
    accessToken,
  );
  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-link" href="/">
        ← Back
      </Link>
      <Text variant="heading-xl">Your lots</Text>
      <Link className="pk-link" href="/lots/new">
        + Add a lot
      </Link>
      {items.length === 0 ? (
        <Text tone="secondary">No lots yet. Add your first car park to get started.</Text>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col">Status</th>
                <th scope="col">Spaces on Parkly</th>
                <th scope="col">Photos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link className="pk-link" href={`/lots/${l.id}`}>
                      {l.name}
                    </Link>
                    <Text variant="body-sm" tone="tertiary">
                      {l.addressLine}
                    </Text>
                  </td>
                  <td>{STATUS[l.status]}</td>
                  <td>{l.capacityBookable}</td>
                  <td>{l.photoCount} / 10</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
