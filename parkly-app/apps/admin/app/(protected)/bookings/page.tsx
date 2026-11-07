import type { AdminBooking } from '@parkly/contracts';
import { formatKobo } from '../../../lib/lots/copy';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { SupportSearch } from '../../../components/support-search';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { overstayOwed } from '../../../lib/bookings/code';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Bookings & Overstays · Parkly Admin' };

const lagosShortTime = new Intl.DateTimeFormat('en-NG', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
});

const TABS = [
  { id: 'all', label: 'All Bookings' },
  { id: 'owed', label: 'Overstay Owed' },
  { id: 'completed', label: 'Completed' },
  { id: 'active', label: 'Active / Live' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Support and operations bookings (FR-ADM-002, FR-BOOK-008): one live search box for
 * a booking code, phone, plate or payment reference, then recent bookings by tab.
 * Each opens its own page with the timeline, the driver's contact (revealed with
 * a reason) and the overstay waiver.
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { accessToken } = await requireAccess();
  const params = await searchParams;
  const currentTab: TabId = TABS.some((t) => t.id === params.tab) ? (params.tab as TabId) : 'all';

  // 1. Fetch recent bookings list
  let items: AdminBooking[] = [];
  try {
    const res = await apiFetch<{ items: AdminBooking[] }>(
      publicEnv().apiUrl,
      '/v1/admin/bookings?limit=50',
      accessToken,
    );
    items = res.items;
  } catch {
    items = [];
  }

  let filteredItems = items;
  const owedCount = items.filter((b) => overstayOwed(b.overstay)).length;
  const activeCount = items.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'PENDING_PAYMENT',
  ).length;
  const completedCount = items.filter((b) => b.status === 'COMPLETED').length;

  if (currentTab === 'owed') {
    filteredItems = filteredItems.filter((b) => overstayOwed(b.overstay));
  } else if (currentTab === 'active') {
    filteredItems = filteredItems.filter(
      (b) =>
        b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'PENDING_PAYMENT',
    );
  } else if (currentTab === 'completed') {
    filteredItems = filteredItems.filter((b) => b.status === 'COMPLETED');
  }

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <div>
        <Text variant="heading-xl" as="h1">
          Bookings & Overstays
        </Text>
        <Text variant="body-sm" tone="secondary">
          Find any booking, see what happened to it, and sort out the driver’s problem. Phone
          numbers stay hidden unless you reveal one, and every reveal is logged.
        </Text>
      </div>

      <SupportSearch />

      <Text variant="heading-md" as="h2">
        Recent bookings
      </Text>

      {/* Styled Filter Sub-Navigation */}
      <nav className="pk-tab-nav" aria-label="Bookings Status Filter">
        {TABS.map((t) => {
          const isActive = t.id === currentTab;
          const count =
            t.id === 'all'
              ? items.length
              : t.id === 'owed'
                ? owedCount
                : t.id === 'active'
                  ? activeCount
                  : completedCount;
          return (
            <Link
              key={t.id}
              className={`pk-tab-item ${isActive ? 'pk-tab-item--active' : ''}`}
              href={t.id === 'all' ? '/bookings' : `/bookings?tab=${t.id}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{t.label}</span>
              {count > 0 ? (
                <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>({count})</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Bookings Table View */}
      {filteredItems.length === 0 ? (
        <div className="pk-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Text variant="heading-md">No bookings found</Text>
          <Text tone="secondary">There are currently no bookings in this view.</Text>
        </div>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Car Park</th>
                <th scope="col">Stay Window</th>
                <th scope="col">Status</th>
                <th scope="col">Overstay</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((b) => {
                const owed = overstayOwed(b.overstay);
                return (
                  <tr key={b.id}>
                    <td>
                      <Link
                        className="pk-link"
                        href={`/bookings/${b.id}`}
                        style={{ fontFamily: 'monospace', fontWeight: 700 }}
                      >
                        {b.code}
                      </Link>
                    </td>
                    <td>
                      <Text variant="body-sm" style={{ fontWeight: 600 }}>
                        {b.plate ?? '—'}
                      </Text>
                    </td>
                    <td>
                      <Text variant="body-sm">{b.lotName}</Text>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Text variant="body-sm">
                        {lagosShortTime.format(new Date(b.startAt))} →{' '}
                        {lagosShortTime.format(new Date(b.endAt))}
                      </Text>
                    </td>
                    <td>
                      <span
                        className={`pk-badge ${
                          b.status === 'COMPLETED'
                            ? 'pk-badge--verified'
                            : b.status === 'CONFIRMED' || b.status === 'CHECKED_IN'
                              ? 'pk-badge--live'
                              : b.status === 'CANCELLED' || b.status === 'NO_SHOW'
                                ? 'pk-badge--suspended'
                                : 'pk-badge--submitted'
                        }`}
                      >
                        {b.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {b.overstay && b.overstay.status === 'UNPAID' ? (
                        <span
                          className="pk-badge pk-badge--suspended"
                          title="Unpaid overstay blocking driver"
                        >
                          ⚠️ {formatKobo(b.overstay.amountKobo)}
                        </span>
                      ) : b.overstay && b.overstay.status === 'DUE' ? (
                        <span className="pk-badge pk-badge--submitted">
                          Due · {formatKobo(b.overstay.amountKobo)}
                        </span>
                      ) : b.overstay && b.overstay.status === 'WAIVED' ? (
                        <span className="pk-badge pk-badge--verified">Waived</span>
                      ) : b.overstay && b.overstay.status === 'PAID' ? (
                        <span className="pk-badge pk-badge--verified">Paid</span>
                      ) : (
                        <Text variant="body-sm" tone="tertiary">
                          —
                        </Text>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link
                        className={`pk-nav-link ${owed ? 'pk-nav-link--active' : ''}`}
                        href={`/bookings/${b.id}`}
                      >
                        {owed ? 'Overstay owed →' : 'Open →'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
