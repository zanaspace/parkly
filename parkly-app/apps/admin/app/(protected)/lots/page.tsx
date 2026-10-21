import type { AdminLotSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Lots · Parkly Admin' };

const TABS = [
  { status: 'PENDING_VERIFICATION', label: 'Waiting for review' },
  { status: 'LIVE', label: 'Live' },
  { status: 'SUSPENDED', label: 'Suspended' },
] as const;
type TabStatus = (typeof TABS)[number]['status'];

const lagos = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' });

/** X-02: lots waiting for permit, price, photo and site review, plus live and suspended lots. */
export default async function LotQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { accessToken } = await requireAccess();
  const { status: asked } = await searchParams;
  const status: TabStatus = TABS.find((t) => t.status === asked)?.status ?? 'PENDING_VERIFICATION';
  const { items } = await apiFetch<{ items: AdminLotSummary[] }>(
    publicEnv().apiUrl,
    `/v1/admin/lots?status=${status}`,
    accessToken,
  );
  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-link" href="/">
        ← Home
      </Link>
      <Text variant="heading-xl">Lots</Text>
      <nav className="pk-row" aria-label="Lot status">
        {TABS.map((t) =>
          t.status === status ? (
            <Text key={t.status} variant="label-lg" aria-current="page">
              {t.label}
            </Text>
          ) : (
            <Link key={t.status} className="pk-link" href={`/lots?status=${t.status}`}>
              {t.label}
            </Link>
          ),
        )}
      </nav>
      {items.length === 0 ? (
        <Text tone="secondary">No lots here.</Text>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col">Operator</th>
                <th scope="col">Photos</th>
                <th scope="col">Created</th>
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
                      {l.area ? `${l.area} · ` : ''}
                      {l.addressLine}
                    </Text>
                  </td>
                  <td>{l.operatorName}</td>
                  <td>{l.photoCount}</td>
                  <td>{lagos.format(new Date(l.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
