import type { PlatformEarningsReport } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { money, PERIODS, type Period, percent } from '../lib/finance/period';

function Card({
  title,
  value,
  note,
  strong = false,
}: {
  title: string;
  value: number;
  note: string;
  strong?: boolean;
}) {
  return (
    <div className={`pk-stat-card${strong ? ' pk-money-card--strong' : ''}`}>
      <div>
        <Text variant="label-lg" tone="brand">
          {title}
        </Text>
        <div className="pk-money-value">{money(value)}</div>
        <Text variant="body-sm" tone="secondary">
          {note}
        </Text>
      </div>
    </div>
  );
}

/**
 * FR-ADM-007: Parkly's own revenue for a period, from the ledger: commission,
 * service fees, Paystack's fees and what's left. `basePath` is the page the
 * period links go back to. With `byOperator`, a table splits it by operator.
 */
export function PlatformRevenue({
  report,
  period,
  basePath,
  byOperator = false,
}: {
  report: PlatformEarningsReport | null;
  period: Period;
  basePath: string;
  byOperator?: boolean;
}) {
  const t = report?.totals;
  return (
    <section aria-labelledby="platform-revenue-heading" className="pk-money">
      <div className="pk-money-head">
        <Text variant="heading-md" as="h2" id="platform-revenue-heading">
          Parkly revenue
        </Text>
        <nav aria-label="Period" className="pk-tab-nav pk-tab-nav--wrap">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`${basePath}?period=${p.value}`}
              className={`pk-tab-item${p.value === period ? ' pk-tab-item--active' : ''}`}
              aria-current={p.value === period ? 'page' : undefined}
              scroll={false}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {!t || !report ? (
        <Text variant="body-sm" tone="secondary" role="status">
          We couldn’t load revenue just now. Please refresh to try again.
        </Text>
      ) : (
        <>
          <div className="pk-stat-grid">
            <Card
              title="Net revenue"
              value={t.netRevenueKobo}
              strong
              note="Commission plus service fees, less Paystack’s fees."
            />
            <Card
              title="Commission"
              value={t.commissionKobo}
              note="Parkly’s share of parking, extensions and overstay, after refunds."
            />
            <Card
              title="Service fees"
              value={t.serviceFeeKobo}
              note="Charged to drivers on each booking, after refunds."
            />
            <Card
              title="Paystack fees"
              value={t.paymentFeesKobo}
              note="Card and transfer fees, which Parkly pays."
            />
            <Card
              title="Paid by drivers"
              value={t.grossBookingKobo}
              note={`${t.bookingsCount} ${t.bookingsCount === 1 ? 'booking' : 'bookings'}; ${money(t.netOperatorKobo)} of it is owed to operators; ${money(t.refundKobo)} refunded.`}
            />
          </div>
          <Text variant="caption" tone="secondary">
            {report.from === report.to ? report.from : `${report.from} to ${report.to}`}, Lagos
            time, from the ledger. Refunds count on the day they were made.
          </Text>

          {byOperator && report.operators.length > 0 && (
            <div className="pk-table-wrap">
              <table className="pk-table pk-table--numeric">
                <thead>
                  <tr>
                    <th scope="col">Operator</th>
                    <th scope="col">Rate now</th>
                    <th scope="col">Bookings</th>
                    <th scope="col">Paid by drivers</th>
                    <th scope="col">Commission</th>
                    <th scope="col">Service fees</th>
                    <th scope="col">Paystack fees</th>
                    <th scope="col">Net revenue</th>
                    <th scope="col">Owed to operator</th>
                  </tr>
                </thead>
                <tbody>
                  {report.operators.map((o) => (
                    <tr key={o.operatorId}>
                      <td>{o.operatorName}</td>
                      <td>{percent(o.commissionBps)}</td>
                      <td>{o.bookingsCount}</td>
                      <td>{money(o.grossBookingKobo)}</td>
                      <td>{money(o.commissionKobo)}</td>
                      <td>{money(o.serviceFeeKobo)}</td>
                      <td>{money(o.paymentFeesKobo)}</td>
                      <td>
                        <strong>{money(o.netRevenueKobo)}</strong>
                      </td>
                      <td>{money(o.netOperatorKobo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
