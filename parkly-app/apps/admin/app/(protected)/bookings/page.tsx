import type { AdminBooking } from '@parkly/contracts';
import { formatKobo } from '../../../lib/lots/copy';
import { Button, Text } from '@parkly/ui';
import Link from 'next/link';
import { WaiveOverstayForm } from '../../../components/waive-overstay';
import { apiFetch, ApiProblem } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { bookingCode, canWaive, overstayOwed } from '../../../lib/bookings/code';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Bookings & Overstays · Parkly Admin' };

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

const lagosShortTime = new Intl.DateTimeFormat('en-NG', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
});

const OVERSTAY_TEXT: Record<NonNullable<AdminBooking['overstay']>['status'], string> = {
  NONE: 'None',
  DUE: 'Due (the driver has 24 hours)',
  UNPAID: 'Unpaid: blocking new bookings',
  PAID: 'Paid',
  WAIVED: 'Waived',
};

const TABS = [
  { id: 'all', label: 'All Bookings' },
  { id: 'owed', label: 'Overstay Owed' },
  { id: 'completed', label: 'Completed' },
  { id: 'active', label: 'Active / Live' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Support and operations bookings management.
 * Shows recent bookings, quick filters, and lets staff inspect and waive overstays (FR-BOOK-008, gap review L-4).
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; q?: string; tab?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const params = await searchParams;
  const typed = params.q ?? params.code ?? '';
  const currentTab: TabId = TABS.some((t) => t.id === params.tab)
    ? (params.tab as TabId)
    : 'all';

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

  // 2. If a specific code was selected or typed, fetch/find it
  const code = typed ? bookingCode(typed) : null;
  let selectedBooking: AdminBooking | null = null;
  let problem: string | null = typed && !code && params.code ? 'Booking codes look like PK-3MV7BU.' : null;

  if (code) {
    selectedBooking = items.find((b) => b.code === code) ?? null;
    if (!selectedBooking) {
      try {
        selectedBooking = await apiFetch<AdminBooking>(
          publicEnv().apiUrl,
          `/v1/admin/bookings/by-code/${encodeURIComponent(code)}`,
          accessToken,
        );
      } catch (err) {
        problem =
          err instanceof ApiProblem && err.status === 404
            ? `No booking found for ${code}.`
            : err instanceof ApiProblem && err.status === 403
              ? 'Your role cannot look up bookings.'
              : 'Could not load booking details.';
      }
    }
  }

  // 3. Filter items by search query and active tab
  let filteredItems = items;
  if (typed && !code) {
    const qLower = typed.toLowerCase().trim();
    filteredItems = filteredItems.filter(
      (b) =>
        b.code.toLowerCase().includes(qLower) ||
        (b.plate && b.plate.toLowerCase().includes(qLower)) ||
        b.lotName.toLowerCase().includes(qLower),
    );
  }

  const owedCount = items.filter((b) => overstayOwed(b.overstay)).length;
  const activeCount = items.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'PENDING_PAYMENT',
  ).length;
  const completedCount = items.filter((b) => b.status === 'COMPLETED').length;

  if (currentTab === 'owed') {
    filteredItems = filteredItems.filter((b) => overstayOwed(b.overstay));
  } else if (currentTab === 'active') {
    filteredItems = filteredItems.filter(
      (b) => b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'PENDING_PAYMENT',
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
          Browse bookings across all lots, inspect driver stays, and manage overstay waivers with audit tracking.
        </Text>
      </div>

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

      {/* Search Input Bar */}
      <form className="pk-row" action="/bookings" method="get">
        {currentTab !== 'all' ? <input type="hidden" name="tab" value={currentTab} /> : null}
        <label className="pk-field" style={{ flex: 1 }}>
          <span className="pk-field__label">Search Bookings</span>
          <input
            className="pk-input"
            name="q"
            defaultValue={typed}
            placeholder="Search by code (e.g. PK-WVGMRS), license plate, or lot name..."
          />
        </label>
        <Button type="submit">Search</Button>
        {typed ? (
          <Link
            href={currentTab === 'all' ? '/bookings' : `/bookings?tab=${currentTab}`}
            className="pk-nav-link"
            style={{ alignSelf: 'flex-end', paddingBottom: '0.6rem' }}
          >
            Clear
          </Link>
        ) : null}
      </form>

      {problem && (
        <p className="pk-notice pk-notice--error" role="alert">
          {problem}
        </p>
      )}

      {/* Selected Booking Detail & Waiver Card */}
      {selectedBooking && (
        <section
          className="pk-card pk-stack"
          style={{
            borderLeft: overstayOwed(selectedBooking.overstay)
              ? '4px solid #ef4444'
              : '4px solid var(--pk-color-brand-primary, #00875a)',
          }}
          aria-label={`Booking ${selectedBooking.code}`}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <Text variant="heading-md" as="h2">
                {selectedBooking.code} · {selectedBooking.lotName}
              </Text>
              <Text tone="secondary">
                {selectedBooking.plate ? `Vehicle: ${selectedBooking.plate} · ` : ''}
                {lagosTime.format(new Date(selectedBooking.startAt))} to{' '}
                {lagosTime.format(new Date(selectedBooking.endAt))}
              </Text>
            </div>
            <div>
              <span
                className={`pk-badge ${
                  selectedBooking.status === 'COMPLETED'
                    ? 'pk-badge--verified'
                    : selectedBooking.status === 'CONFIRMED' || selectedBooking.status === 'CHECKED_IN'
                      ? 'pk-badge--live'
                      : 'pk-badge--submitted'
                }`}
              >
                {selectedBooking.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {selectedBooking.overstay && selectedBooking.overstay.amountKobo > 0 ? (
            <div
              style={{
                backgroundColor:
                  selectedBooking.overstay.status === 'UNPAID'
                    ? '#fef2f2'
                    : selectedBooking.overstay.status === 'DUE'
                      ? '#fff8eb'
                      : 'transparent',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--pk-radius-sm, 0.375rem)',
                border:
                  selectedBooking.overstay.status === 'UNPAID'
                    ? '1px solid #fbc4c0'
                    : selectedBooking.overstay.status === 'DUE'
                      ? '1px solid #fdd48a'
                      : 'none',
              }}
            >
              <Text
                style={{
                  fontWeight: 600,
                  color:
                    selectedBooking.overstay.status === 'UNPAID'
                      ? '#771a14'
                      : selectedBooking.overstay.status === 'DUE'
                        ? '#6f420c'
                        : 'inherit',
                }}
              >
                Overstay: {selectedBooking.overstay.minutes} min,{' '}
                {formatKobo(selectedBooking.overstay.amountKobo)}.{' '}
                {OVERSTAY_TEXT[selectedBooking.overstay.status]}
              </Text>
            </div>
          ) : (
            <Text tone="secondary">No overstay recorded for this booking.</Text>
          )}

          {overstayOwed(selectedBooking.overstay) && canWaive(me.roles) && (
            <div style={{ marginTop: '0.5rem' }}>
              <WaiveOverstayForm
                bookingId={selectedBooking.id}
                amount={formatKobo(selectedBooking.overstay?.amountKobo ?? 0)}
              />
            </div>
          )}
        </section>
      )}

      {/* Bookings Table View */}
      {filteredItems.length === 0 ? (
        <div className="pk-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Text variant="heading-md">No bookings found</Text>
          <Text tone="secondary">
            {typed
              ? `No bookings match "${typed}". Try another search or clear the filter.`
              : 'There are currently no bookings in this view.'}
          </Text>
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
                const isSelected = selectedBooking?.id === b.id;
                const owed = overstayOwed(b.overstay);
                return (
                  <tr
                    key={b.id}
                    style={{
                      background: isSelected ? 'var(--pk-color-bg-subtle, #f8fafc)' : undefined,
                    }}
                  >
                    <td>
                      <Link
                        className="pk-link"
                        href={`/bookings?code=${b.code}${currentTab !== 'all' ? `&tab=${currentTab}` : ''}`}
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
                        href={`/bookings?code=${b.code}${currentTab !== 'all' ? `&tab=${currentTab}` : ''}`}
                      >
                        {owed ? 'Waive / Details →' : 'Inspect →'}
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
