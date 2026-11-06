import type { LotSummary, OperatorBookingList } from '@parkly/contracts';
import { Input, Select, Text } from '@parkly/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiProblem, apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import {
  filterQuery,
  naira,
  readFilters,
  STATUS_OPTIONS,
  stayLabel,
  statusLabel,
  timeLabel,
} from '../../../lib/bookings/filters';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Bookings · Parkly for Operators' };

const ERRORS: Record<string, string> = {
  REPORT_RANGE_INVALID: 'Choose a “from” date on or before “to”, at most 93 days apart.',
  EXPORT_TOO_LARGE:
    'More than 10,000 bookings match, which is too many for one file. Choose fewer days or one car park.',
};
const GENERIC_ERROR = 'We couldn’t load bookings just now. Please try again.';

const STATUS_BADGE: Record<string, string> = {
  CONFIRMED: 'pk-badge--submitted',
  CHECKED_IN: 'pk-badge--live',
  COMPLETED: 'pk-badge--verified',
  NO_SHOW: 'pk-badge--rejected',
  CANCELLED: 'pk-badge--draft',
};

/**
 * FR-OPS-002: the operator's bookings with filters, pages and a CSV download.
 * A plain GET form, so filtering works without JavaScript. Drivers appear by
 * first name and plate only.
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  if (!grant?.operatorId) redirect('/');
  const operatorId = grant.operatorId;
  const api = publicEnv().apiUrl;

  const params = await searchParams;
  const filters = readFilters(params, Date.now());
  const cursor = typeof params.cursor === 'string' ? params.cursor : '';
  const exportError = typeof params.exportError === 'string' ? params.exportError : '';

  const [lots, result] = await Promise.all([
    apiFetch<{ items: LotSummary[] }>(api, `/v1/operators/${operatorId}/lots`, accessToken)
      .then((r) => r.items)
      .catch(() => []),
    apiFetch<OperatorBookingList>(
      api,
      `/v1/operators/${operatorId}/bookings?${filterQuery(filters, cursor ? { cursor } : {})}`,
      accessToken,
    ).catch((e: unknown) => (e instanceof ApiProblem ? e : new ApiProblem(500, 'UNKNOWN'))),
  ]);
  const error = result instanceof ApiProblem ? (ERRORS[result.code] ?? GENERIC_ERROR) : null;
  const page = result instanceof ApiProblem ? null : result;
  const exportHref = `/api/operators/${operatorId}/bookings/export?${filterQuery(filters)}`;

  return (
    <main className="pk-page pk-page--wide">
      <div>
        <Text variant="heading-xl">Bookings</Text>
        <Text variant="body-sm" tone="secondary">
          Every booking at your car parks. Drivers are shown by first name and plate only.
        </Text>
      </div>

      <form
        method="get"
        action="/bookings"
        className="pk-card"
        style={{ display: 'grid', gap: '1rem' }}
      >
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          }}
        >
          <Select
            label="Car park"
            name="lotId"
            defaultValue={filters.lotId}
            options={[
              { value: '', label: 'All car parks' },
              ...lots.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <Input label="From" name="from" type="date" defaultValue={filters.from} required />
          <Input label="To" name="to" type="date" defaultValue={filters.to} required />
          <Select
            label="Status"
            name="status"
            defaultValue={filters.status}
            options={STATUS_OPTIONS}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="submit" className="pk-button pk-button--primary">
            Show bookings
          </button>
          <a className="pk-button pk-button--secondary" href={exportHref} download>
            Download CSV
          </a>
        </div>
        <Text variant="body-sm" tone="secondary">
          Dates are when the booking starts, in Lagos time. The CSV has every booking that matches
          (up to 10,000) and records that you downloaded it.
        </Text>
      </form>

      {(error || ERRORS[exportError] || exportError) && (
        <div
          className="pk-card"
          role="alert"
          style={{ borderColor: 'var(--pk-color-status-danger-fg)' }}
        >
          <Text>{error ?? ERRORS[exportError] ?? GENERIC_ERROR}</Text>
        </div>
      )}

      {page && page.items.length === 0 && (
        <div className="pk-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <Text variant="heading-md">No bookings match</Text>
          <Text tone="secondary">Try more days, another car park or “All bookings”.</Text>
        </div>
      )}

      {page && page.items.length > 0 && (
        <>
          <div className="pk-table-desktop">
            <div className="pk-table-wrap">
              <table className="pk-table">
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Car park</th>
                    <th scope="col">Stay</th>
                    <th scope="col">Driver</th>
                    <th scope="col">Status</th>
                    <th scope="col">In / out</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong style={{ fontFamily: 'var(--pk-font-family-mono)' }}>
                          {b.code}
                        </strong>
                      </td>
                      <td>{b.lotName}</td>
                      <td>{stayLabel(b.startAt, b.endAt)}</td>
                      <td>
                        {b.plate}
                        {b.driverFirstName ? (
                          <Text variant="body-sm" tone="secondary" style={{ display: 'block' }}>
                            {b.driverFirstName}
                          </Text>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`pk-badge ${STATUS_BADGE[b.status] ?? 'pk-badge--draft'}`}
                          style={{ textTransform: 'none' }}
                        >
                          {statusLabel(b.status)}
                        </span>
                        {b.autoClosed ? (
                          <Text variant="body-sm" tone="secondary" style={{ display: 'block' }}>
                            Checked out automatically
                          </Text>
                        ) : null}
                      </td>
                      <td>
                        {timeLabel(b.checkInAt)} / {timeLabel(b.checkOutAt)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {naira(b.totalKobo)}
                        {b.overstayAmountKobo > 0 ? (
                          <Text variant="body-sm" tone="secondary" style={{ display: 'block' }}>
                            Overstay {naira(b.overstayAmountKobo)} ({b.overstayStatus.toLowerCase()}
                            )
                          </Text>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pk-cards-mobile">
            {page.items.map((b) => (
              <div key={b.id} className="pk-card pk-mobile-record-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <strong>{b.code}</strong>
                  <span
                    className={`pk-badge ${STATUS_BADGE[b.status] ?? 'pk-badge--draft'}`}
                    style={{ textTransform: 'none', flexShrink: 0 }}
                  >
                    {statusLabel(b.status)}
                  </span>
                </div>
                <Text variant="body-sm">{b.lotName}</Text>
                <Text variant="body-sm" tone="secondary">
                  {stayLabel(b.startAt, b.endAt)}
                </Text>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <Text variant="body-sm">
                    {b.plate}
                    {b.driverFirstName ? ` · ${b.driverFirstName}` : ''}
                  </Text>
                  <Text variant="body-sm">{naira(b.totalKobo)}</Text>
                </div>
                <Text variant="body-sm" tone="secondary">
                  In {timeLabel(b.checkInAt)} · Out {timeLabel(b.checkOutAt)}
                  {b.autoClosed ? ' (automatic)' : ''}
                </Text>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            {cursor ? (
              <Link className="pk-nav-link" href={`/bookings?${filterQuery(filters)}`}>
                First page
              </Link>
            ) : null}
            {page.nextCursor ? (
              <Link
                className="pk-nav-link pk-nav-link--active"
                href={`/bookings?${filterQuery(filters, { cursor: page.nextCursor })}`}
              >
                Next page →
              </Link>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
