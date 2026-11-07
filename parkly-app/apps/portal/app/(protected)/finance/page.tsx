import type {
  DailyEarningsItem,
  LotSummary,
  Operator,
  OperatorEarningsReport,
  PayoutAccount,
} from '@parkly/contracts';
import { Input, Select, Text } from '@parkly/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiProblem, apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import {
  financeQuery,
  money,
  monthLabel,
  readFinanceFilters,
  statementMonths,
} from '../../../lib/finance/period';

export const metadata = { title: 'Finance · Parkly for Operators' };

const ERRORS: Record<string, string> = {
  REPORT_RANGE_INVALID: 'Choose a “from” date on or before “to”, at most 93 days apart.',
};
const GENERIC_ERROR = 'We couldn’t load your figures just now. Please try again.';
const STATEMENT_ERROR = 'We couldn’t make that statement just now. Please try again.';

const PAYOUT_BADGE: Record<DailyEarningsItem['settlementStatus'], [string, string] | null> = {
  NONE: null,
  SETTLED: ['pk-badge--verified', 'Paid out'],
  PROCESSING: ['pk-badge--submitted', 'On its way'],
  PENDING: ['pk-badge--submitted', 'Pending'],
  PARTIAL: ['pk-badge--submitted', 'Part paid'],
  FAILED: ['pk-badge--rejected', 'Failed'],
};

const active = (d: DailyEarningsItem) =>
  d.grossBookingKobo !== 0 ||
  d.refundKobo !== 0 ||
  d.settlementKobo !== 0 ||
  d.settlementStatus !== 'NONE';

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function PayoutBadge({ status }: { status: DailyEarningsItem['settlementStatus'] }) {
  const badge = PAYOUT_BADGE[status];
  if (!badge)
    return (
      <Text variant="body-sm" tone="secondary">
        —
      </Text>
    );
  return (
    <span className={`pk-badge ${badge[0]}`} style={{ textTransform: 'none' }}>
      {badge[1]}
    </span>
  );
}

/**
 * FR-OPS-003 / FR-OPS-006: day-by-day earnings, payouts to the bank, the CSV
 * and monthly statement PDFs, for owners and managers. Figures come from the
 * revenue report, which reads the ledger. A plain GET form, so it works
 * without JavaScript; downloads go through same-origin routes that keep the
 * token server-side.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  if (!grant?.operatorId) redirect('/');
  const operatorId = grant.operatorId;
  const api = publicEnv().apiUrl;
  const base = `/v1/operators/${operatorId}`;

  const params = await searchParams;
  const now = Date.now();
  const filters = readFinanceFilters(params, now);
  const exportError = typeof params.exportError === 'string' ? params.exportError : '';
  const statementError = typeof params.statementError === 'string';

  const [operator, lots, payout, result] = await Promise.all([
    apiFetch<Operator>(api, base, accessToken).catch(() => null),
    apiFetch<{ items: LotSummary[] }>(api, `${base}/lots`, accessToken)
      .then((r) => r.items)
      .catch(() => []),
    apiFetch<{ account: PayoutAccount | null }>(api, `${base}/payout-account`, accessToken)
      .then((r) => r.account)
      .catch(() => null),
    apiFetch<OperatorEarningsReport>(
      api,
      `${base}/reports/earnings?${financeQuery(filters)}`,
      accessToken,
    ).catch((e: unknown) => (e instanceof ApiProblem ? e : new ApiProblem(500, 'UNKNOWN'))),
  ]);
  const report = result instanceof ApiProblem ? null : result;
  const error =
    result instanceof ApiProblem
      ? (ERRORS[result.code] ?? GENERIC_ERROR)
      : exportError
        ? (ERRORS[exportError] ?? GENERIC_ERROR)
        : statementError
          ? STATEMENT_ERROR
          : null;
  const days = report ? report.daily.filter(active).reverse() : [];
  const t = report?.totals;
  const months = statementMonths(operator?.createdAt ?? null, now);
  const exportHref = `/api/operators/${operatorId}/reports/export?${financeQuery(filters)}`;

  return (
    <main className="pk-page pk-page--wide">
      <div>
        <Text variant="heading-xl">Finance</Text>
        <Text variant="body-sm" tone="secondary">
          What drivers paid, what you earned and what Paystack has paid to your bank.
        </Text>
      </div>

      <div className="pk-card pk-finance-payout">
        <Text variant="label-lg" tone="brand">
          Payouts go to
        </Text>
        {payout ? (
          <Text>
            {payout.bankName} ·••• {payout.accountNumberLast4} · {payout.accountName}
            {payout.status !== 'ACTIVE' ? (
              <span className="pk-badge pk-badge--submitted" style={{ textTransform: 'none' }}>
                Not active yet
              </span>
            ) : null}
          </Text>
        ) : (
          <Text tone="secondary">
            No bank account yet. <Link href="/kyb">Add one in Verification (KYB)</Link> to get paid.
          </Text>
        )}
      </div>

      <form method="get" action="/finance" className="pk-card pk-finance-form">
        <div className="pk-finance-fields">
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
        </div>
        <div className="pk-row">
          <button type="submit" className="pk-button pk-button--primary">
            Show figures
          </button>
          <a className="pk-button pk-button--secondary" href={exportHref} download>
            Download CSV
          </a>
        </div>
        <Text variant="body-sm" tone="secondary">
          Lagos dates, at most 93 days. Money is counted on the day it was paid, and refunds on the
          day they were made. The CSV records that you downloaded it.
        </Text>
      </form>

      {error && (
        <div className="pk-card pk-finance-alert" role="alert">
          <Text>{error}</Text>
        </div>
      )}

      {t && (
        <div className="pk-stat-grid">
          <div className="pk-stat-card pk-money-card pk-money-card--strong">
            <div>
              <Text variant="label-lg" tone="brand">
                Your earnings
              </Text>
              <div className="pk-money-value">{money(t.netOperatorKobo)}</div>
              <Text variant="body-sm" tone="secondary">
                From {money(t.grossBookingKobo)} paid by drivers, after {money(t.commissionKobo)}{' '}
                commission, {money(t.serviceFeeKobo)} service fees and {money(t.refundKobo)}{' '}
                refunds.
              </Text>
            </div>
          </div>
          <div className="pk-stat-card pk-money-card">
            <div>
              <Text variant="label-lg" tone="brand">
                Paid to your bank
              </Text>
              <div className="pk-money-value">{money(t.settlementKobo)}</div>
              <Text variant="body-sm" tone="secondary">
                Payouts that reached your account in these dates. Paystack pays out on its own
                schedule, so this can lag your earnings by a few days.
              </Text>
            </div>
          </div>
        </div>
      )}

      {report && days.length === 0 && (
        <div className="pk-card pk-finance-empty">
          <Text variant="heading-md">No money in these dates</Text>
          <Text tone="secondary">Try more days or “All car parks”.</Text>
        </div>
      )}

      {report && t && days.length > 0 && (
        <section aria-labelledby="days-heading" className="pk-money">
          <Text variant="heading-md" as="h2" id="days-heading">
            Day by day
          </Text>
          <div className="pk-table-desktop">
            <div className="pk-table-wrap">
              <table className="pk-table pk-table--numeric">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Bookings</th>
                    <th scope="col">Paid by drivers</th>
                    <th scope="col">Commission</th>
                    <th scope="col">Service fees</th>
                    <th scope="col">Refunds</th>
                    <th scope="col">Your earnings</th>
                    <th scope="col">Paid to bank</th>
                    <th scope="col">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td>{dayLabel(d.date)}</td>
                      <td>{d.bookingsCount}</td>
                      <td>{money(d.grossBookingKobo)}</td>
                      <td>{money(d.commissionKobo)}</td>
                      <td>{money(d.serviceFeeKobo)}</td>
                      <td>{d.refundKobo ? money(d.refundKobo) : '—'}</td>
                      <td>
                        <strong>{money(d.netOperatorKobo)}</strong>
                      </td>
                      <td>{d.settlementKobo ? money(d.settlementKobo) : '—'}</td>
                      <td>
                        <PayoutBadge status={d.settlementStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td>{t.bookingsCount}</td>
                    <td>{money(t.grossBookingKobo)}</td>
                    <td>{money(t.commissionKobo)}</td>
                    <td>{money(t.serviceFeeKobo)}</td>
                    <td>{money(t.refundKobo)}</td>
                    <td>
                      <strong>{money(t.netOperatorKobo)}</strong>
                    </td>
                    <td>{money(t.settlementKobo)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="pk-cards-mobile">
            {days.map((d) => (
              <div key={d.date} className="pk-card pk-mobile-record-card">
                <div className="pk-finance-card-head">
                  <strong>{dayLabel(d.date)}</strong>
                  <PayoutBadge status={d.settlementStatus} />
                </div>
                <div className="pk-finance-card-head">
                  <Text variant="body-sm">Your earnings</Text>
                  <strong>{money(d.netOperatorKobo)}</strong>
                </div>
                <Text variant="body-sm" tone="secondary">
                  {d.bookingsCount} {d.bookingsCount === 1 ? 'booking' : 'bookings'} ·{' '}
                  {money(d.grossBookingKobo)} paid · {money(d.commissionKobo)} commission
                  {d.refundKobo ? ` · ${money(d.refundKobo)} refunded` : ''}
                </Text>
                {d.settlementKobo ? (
                  <Text variant="body-sm" tone="secondary">
                    {money(d.settlementKobo)} paid to your bank
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
          <Text variant="caption" tone="secondary">
            Days with no money are left out.
          </Text>
        </section>
      )}

      <section aria-labelledby="statements-heading" className="pk-money">
        <Text variant="heading-md" as="h2" id="statements-heading">
          Monthly statements
        </Text>
        <Text variant="body-sm" tone="secondary">
          A PDF statement for each month, for your accounts and tax. The owner also gets last
          month’s by email on the 1st.
        </Text>
        <ul className="pk-card pk-finance-statements">
          {months.map((m, i) => (
            <li key={m}>
              <span>
                {monthLabel(m)}
                {i === 0 ? (
                  <Text as="span" variant="body-sm" tone="secondary">
                    {' '}
                    (so far)
                  </Text>
                ) : null}
              </span>
              <a
                className="pk-nav-link"
                href={`/api/operators/${operatorId}/reports/statements/${m}`}
                download
              >
                Download PDF
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
