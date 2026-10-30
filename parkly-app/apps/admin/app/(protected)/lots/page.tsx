import type { AdminLotSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Lots Management · Parkly Admin' };

const TABS = [
  { status: 'PENDING_VERIFICATION', label: 'Waiting for Review' },
  { status: 'LIVE', label: 'Live Lots' },
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
          <Text variant="heading-xl">Lots & Permits</Text>
          <Text variant="body-sm" tone="secondary">
            Manage off-street parking facilities, LASPA permits, on-site verifications, and pricing
            reviews.
          </Text>
        </div>
      </div>

      {/* Styled Filter Sub-Navigation */}
      <nav className="pk-tab-nav" aria-label="Lot Status Filter">
        {TABS.map((t) => {
          const isActive = t.status === status;
          return (
            <Link
              key={t.status}
              className={`pk-tab-item ${isActive ? 'pk-tab-item--active' : ''}`}
              href={`/lots?status=${t.status}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{t.label}</span>
              {isActive && items.length > 0 ? (
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({items.length})</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="pk-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Text variant="heading-md">No Lots in this View</Text>
          <Text tone="secondary">
            There are currently no car parks with status <strong>{status}</strong>.
          </Text>
        </div>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Car Park Facility</th>
                <th scope="col">Operator Entity</th>
                <th scope="col">Photos</th>
                <th scope="col">Price Review</th>
                <th scope="col">Registered</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link
                      className="pk-link"
                      href={`/lots/${l.id}`}
                      style={{ fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}
                    >
                      {l.name}
                    </Link>
                    <Text variant="body-sm" tone="tertiary" style={{ display: 'block' }}>
                      {l.area ? `${l.area} · ` : ''}
                      {l.addressLine}
                    </Text>
                  </td>
                  <td>
                    <Text variant="body-sm" style={{ fontWeight: 500 }}>
                      {l.operatorName}
                    </Text>
                  </td>
                  <td>
                    <Text variant="body-sm">
                      {l.photoCount} photo{l.photoCount === 1 ? '' : 's'}
                    </Text>
                  </td>
                  <td>
                    {l.pendingPriceCount > 0 ? (
                      <span className="pk-badge pk-badge--submitted">
                        {l.pendingPriceCount} pending
                      </span>
                    ) : (
                      <Text variant="body-sm" tone="tertiary">
                        —
                      </Text>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Text variant="body-sm">{lagos.format(new Date(l.createdAt))}</Text>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      className="pk-nav-link pk-nav-link--active"
                      href={`/lots/${l.id}`}
                      style={{ display: 'inline-flex' }}
                    >
                      Inspect Lot →
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
