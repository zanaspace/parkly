import type { OperatorEarningsReport } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { money, PERIODS, type Period } from '../lib/finance/period';

function MoneyCard({
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
    <div className={`pk-stat-card pk-money-card${strong ? ' pk-money-card--strong' : ''}`}>
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
 * FR-OPS-003 on the portal home: what drivers paid and what the operator
 * earned for the chosen period, from the revenue report (which reads the
 * ledger). The period is a plain link, so it works without JavaScript.
 */
export function RevenueSummary({
  report,
  period,
}: {
  report: OperatorEarningsReport | null;
  period: Period;
}) {
  const t = report?.totals;
  return (
    <section aria-labelledby="money-heading" className="pk-money">
      <div className="pk-money-head">
        <Text variant="heading-md" as="h2" id="money-heading">
          Money
        </Text>
        <nav aria-label="Period" className="pk-tab-nav pk-tab-nav--wrap">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/?period=${p.value}`}
              className={`pk-tab-item${p.value === period ? ' pk-tab-item--active' : ''}`}
              aria-current={p.value === period ? 'page' : undefined}
              scroll={false}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {!t ? (
        <Text variant="body-sm" tone="secondary" role="status">
          We couldn’t load your money figures just now. Please refresh to try again.
        </Text>
      ) : (
        <>
          <div className="pk-stat-grid">
            <MoneyCard
              title="Your earnings"
              value={t.netOperatorKobo}
              strong
              note="Your share after Parkly’s commission and any refunds."
            />
            <MoneyCard
              title="Paid to your bank"
              value={t.settlementKobo}
              note="Payouts Paystack has sent to your bank account in this period."
            />
            <MoneyCard
              title="Paid by drivers"
              value={t.grossBookingKobo}
              note={`${t.bookingsCount} ${t.bookingsCount === 1 ? 'booking' : 'bookings'}, plus extensions and overstay, less ${money(t.refundKobo)} refunded.`}
            />
            <MoneyCard
              title="Parkly commission"
              value={t.commissionKobo}
              note={`Plus ${money(t.serviceFeeKobo)} in service fees, which drivers pay to Parkly.`}
            />
            <MoneyCard
              title="Overstay and extensions"
              value={t.overstayKobo + t.extensionKobo}
              note={`${money(t.overstayKobo)} overstay and ${money(t.extensionKobo)} extensions, before commission.`}
            />
          </div>
          {report && (
            <Text variant="caption" tone="secondary">
              {report.from === report.to ? report.from : `${report.from} to ${report.to}`}, Lagos
              time. Refunds count on the day they were made.
            </Text>
          )}
          <Link className="pk-nav-link pk-nav-link--active" href="/finance">
            Day by day, payouts and statements →
          </Link>
        </>
      )}
    </section>
  );
}
