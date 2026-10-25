import type { LotSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { LotsIcon, PlusIcon } from '../../../components/icons';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { lotOperatorId } from './operator';

export const metadata = { title: 'Lots · Parkly for Operators' };

const STATUS_CONFIG: Record<LotSummary['status'], { label: string; class: string }> = {
  DRAFT: { label: 'Draft', class: 'pk-badge--draft' },
  PENDING_VERIFICATION: { label: 'Under Review', class: 'pk-badge--submitted' },
  LIVE: { label: 'Live · Visible in Search', class: 'pk-badge--live' },
  PAUSED: { label: 'Paused · Hidden from Search', class: 'pk-badge--submitted' },
  SUSPENDED: { label: 'Suspended', class: 'pk-badge--suspended' },
  ARCHIVED: { label: 'Archived', class: 'pk-badge--draft' },
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
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <LotsIcon size={22} style={{ color: 'var(--pk-color-text-brand)' }} />
            <Text variant="heading-xl">Parking Lots & Facilities</Text>
          </div>
          <Text variant="body-sm" tone="secondary">
            Manage your car parks, review LASPA permits, set rates, and inspect bays.
          </Text>
        </div>
        <Link className="pk-nav-link pk-nav-link--active" href="/lots/new">
          <PlusIcon size={16} />
          <span>Add New Car Park</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="pk-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <Text variant="heading-md">No Car Parks Configured</Text>
          <Text tone="secondary" style={{ maxWidth: '28rem', marginInline: 'auto' }}>
            Add your first parking facility to set capacity, live hourly pricing, and upload verification photos.
          </Text>
          <div style={{ marginTop: '1.25rem' }}>
            <Link className="pk-nav-link pk-nav-link--active" href="/lots/new">
              <PlusIcon size={16} />
              <span>Add Your First Lot</span>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table (> 860px) */}
          <div className="pk-table-desktop">
            <div className="pk-table-wrap">
              <table className="pk-table">
                <thead>
                  <tr>
                    <th scope="col">Facility Name & Location</th>
                    <th scope="col">Status</th>
                    <th scope="col">Bookable Bays</th>
                    <th scope="col">Inspection Photos</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => {
                    const badge = STATUS_CONFIG[l.status] ?? { label: l.status, class: 'pk-badge--draft' };
                    return (
                      <tr key={l.id}>
                        <td>
                          <div>
                            <Link
                              className="pk-link"
                              href={`/lots/${l.id}`}
                              style={{ fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}
                            >
                              {l.name}
                            </Link>
                            <Text variant="body-sm" tone="tertiary" style={{ display: 'block', marginTop: '0.2rem' }}>
                              {l.addressLine}
                            </Text>
                          </div>
                        </td>
                        <td>
                          <span className={`pk-badge ${badge.class}`}>{badge.label}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--pk-color-text-primary)' }}>
                            {l.capacityBookable} bays
                          </span>
                        </td>
                        <td>
                          <span style={{ color: l.photoCount >= 3 ? 'var(--pk-color-text-brand)' : 'var(--pk-color-text-secondary)', fontWeight: 500 }}>
                            {l.photoCount} / 10 photos
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            className="pk-nav-link pk-nav-link--active"
                            href={`/lots/${l.id}`}
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            Manage Lot →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards (<= 860px, fits 100% width with no horizontal scroll) */}
          <div className="pk-cards-mobile">
            {items.map((l) => {
              const badge = STATUS_CONFIG[l.status] ?? { label: l.status, class: 'pk-badge--draft' };
              return (
                <div key={l.id} className="pk-card pk-mobile-record-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link
                        href={`/lots/${l.id}`}
                        style={{
                          fontWeight: 600,
                          fontSize: '1rem',
                          color: 'var(--pk-color-text-primary)',
                          textDecoration: 'none',
                          display: 'inline-block',
                          wordBreak: 'break-word',
                        }}
                      >
                        {l.name}
                      </Link>
                      <Text variant="body-sm" tone="tertiary" style={{ display: 'block', marginTop: '0.2rem' }}>
                        {l.addressLine}
                      </Text>
                    </div>
                    <span className={`pk-badge ${badge.class}`} style={{ flexShrink: 0 }}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="pk-mobile-record-metrics">
                    <div className="pk-mobile-metric-item">
                      <span className="pk-mobile-metric-label">Bookable Bays</span>
                      <span className="pk-mobile-metric-val">
                        {l.capacityBookable} bays
                      </span>
                    </div>
                    <div className="pk-mobile-metric-item">
                      <span className="pk-mobile-metric-label">Inspection Photos</span>
                      <span
                        className="pk-mobile-metric-val"
                        style={{
                          color: l.photoCount >= 3 ? 'var(--pk-color-text-brand)' : 'var(--pk-color-text-secondary)',
                        }}
                      >
                        {l.photoCount} / 10 photos
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.25rem' }}>
                    <Link
                      className="pk-nav-link pk-nav-link--active pk-mobile-card-action"
                      href={`/lots/${l.id}`}
                    >
                      <span>Manage Lot</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
