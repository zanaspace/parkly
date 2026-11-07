import type { PlatformEarningsReport, ReconciliationRun } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { PlatformRevenue } from '../../../components/platform-revenue';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { periodRange, readPeriod } from '../../../lib/finance/period';

export const metadata = { title: 'Finance & Reconciliation · Parkly Admin' };

const FINANCE_READERS = new Set(['ADMIN_FINANCE', 'SUPER_ADMIN']);

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

function runStatusBadge(status: ReconciliationRun['status'], mismatchedCount: number) {
  if (status === 'COMPLETED_WITH_EXCEPTIONS' || (status === 'COMPLETED' && mismatchedCount > 0)) {
    return (
      <span
        className="pk-badge pk-badge--submitted"
        style={{ background: '#fff1f0', color: '#cf1322', borderColor: '#ffa39e' }}
      >
        Mismatch ({mismatchedCount})
      </span>
    );
  }
  if (status === 'COMPLETED') {
    return <span className="pk-badge pk-badge--approved">Balanced</span>;
  }
  if (status === 'RUNNING') {
    return <span className="pk-badge pk-badge--submitted">Running</span>;
  }
  return <span className="pk-badge pk-badge--rejected">Failed</span>;
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; tab?: string; period?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const canReadFinance = me.roles.some((r) => FINANCE_READERS.has(r.role));
  const params = await searchParams;
  const currentTab = params.tab ?? 'all';
  const period = readPeriod(params);
  const revenue = canReadFinance
    ? await apiFetch<PlatformEarningsReport>(
        publicEnv().apiUrl,
        `/v1/admin/reports/platform-earnings?${new URLSearchParams(periodRange(period, Date.now()))}`,
        accessToken,
      ).catch(() => null)
    : null;

  let runs: ReconciliationRun[] = [];
  let nextCursor: string | null = null;

  if (canReadFinance) {
    try {
      const res = await apiFetch<{ runs: ReconciliationRun[]; nextCursor: string | null }>(
        publicEnv().apiUrl,
        `/v1/admin/reconciliation/runs?limit=50${params.cursor ? `&cursor=${encodeURIComponent(params.cursor)}` : ''}`,
        accessToken,
      );
      runs = res.runs;
      nextCursor = res.nextCursor;
    } catch {
      runs = [];
    }
  }

  // Filter runs based on active tab
  let displayedRuns = runs;
  if (currentTab === 'exceptions') {
    displayedRuns = runs.filter(
      (r) => r.status === 'COMPLETED_WITH_EXCEPTIONS' || r.mismatchedCount > 0,
    );
  } else if (currentTab === 'balanced') {
    displayedRuns = runs.filter((r) => r.status === 'COMPLETED' && r.mismatchedCount === 0);
  }

  // Compute aggregate stats across loaded runs
  // Runs store how many records each side had, not amounts.
  const totalChecked = runs.reduce((acc, r) => acc + r.totalInternal, 0);
  const totalExceptions = runs.reduce((acc, r) => acc + r.mismatchedCount, 0);
  const totalMatched = runs.reduce((acc, r) => acc + r.matchedCount, 0);
  const latestRun = runs[0];

  return (
    <main className="pk-page pk-page--wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text variant="heading-xl">Finance & Daily Reconciliation</Text>
          <Text variant="body-sm" tone="secondary">
            Daily automated payment matching between Paystack transactions and Parkly double-entry
            ledger (FR-PAY-005, FR-ADM-007).
          </Text>
        </div>
      </div>

      {!canReadFinance && (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">
            Finance and settlement reconciliation views are restricted to ADMIN_FINANCE and
            SUPER_ADMIN roles.
          </Text>
        </div>
      )}

      {canReadFinance && (
        <>
          <PlatformRevenue report={revenue} period={period} basePath="/finance" byOperator />

          <Text variant="heading-md" as="h2">
            Daily reconciliation
          </Text>

          {/* Top Overview Cards */}
          <div className="pk-stat-grid">
            <div className="pk-stat-card">
              <Text variant="label-md" tone="secondary">
                Latest Run Status
              </Text>
              <div>
                <div style={{ marginBottom: '0.25rem' }}>
                  {latestRun ? (
                    runStatusBadge(latestRun.status, latestRun.mismatchedCount)
                  ) : (
                    <span className="pk-badge">No runs</span>
                  )}
                </div>
                <Text variant="caption" tone="tertiary">
                  {latestRun
                    ? `Date: ${latestRun.businessDate} · ${latestRun.provider}`
                    : 'No data recorded'}
                </Text>
              </div>
            </div>

            <div className="pk-stat-card">
              <Text variant="label-md" tone="secondary">
                Payments Checked
              </Text>
              <div>
                <div className="pk-stat-count">{totalChecked.toLocaleString()}</div>
                <Text variant="caption" tone="tertiary">
                  Our payment records across {runs.length} daily runs
                </Text>
              </div>
            </div>

            <div className="pk-stat-card">
              <Text variant="label-md" tone="secondary">
                Matched Transactions
              </Text>
              <div>
                <div className="pk-stat-count" style={{ color: '#16a34a' }}>
                  {totalMatched.toLocaleString()}
                </div>
                <Text variant="caption" tone="tertiary">
                  Ledger matches Paystack to the kobo
                </Text>
              </div>
            </div>

            <div className="pk-stat-card">
              <Text variant="label-md" tone="secondary">
                Discrepancies & Exceptions
              </Text>
              <div>
                <div
                  className="pk-stat-count"
                  style={{
                    color: totalExceptions > 0 ? '#dc2626' : 'var(--pk-color-text-primary)',
                  }}
                >
                  {totalExceptions}
                </div>
                <Text variant="caption" tone="tertiary">
                  {totalExceptions > 0
                    ? 'Requires finance resolution'
                    : 'Zero unexplained variances'}
                </Text>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="pk-tab-nav" style={{ marginTop: '0.5rem' }}>
            <Link
              href="/finance"
              className={`pk-tab-item ${currentTab === 'all' ? 'pk-tab-item--active' : ''}`}
            >
              All Runs ({runs.length})
            </Link>
            <Link
              href="/finance?tab=exceptions"
              className={`pk-tab-item ${currentTab === 'exceptions' ? 'pk-tab-item--active' : ''}`}
            >
              Exceptions (
              {
                runs.filter(
                  (r) => r.status === 'COMPLETED_WITH_EXCEPTIONS' || r.mismatchedCount > 0,
                ).length
              }
              )
            </Link>
            <Link
              href="/finance?tab=balanced"
              className={`pk-tab-item ${currentTab === 'balanced' ? 'pk-tab-item--active' : ''}`}
            >
              Balanced (
              {runs.filter((r) => r.status === 'COMPLETED' && r.mismatchedCount === 0).length})
            </Link>
          </div>

          {/* Runs Table */}
          {displayedRuns.length === 0 ? (
            <div className="pk-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <Text variant="heading-sm">No reconciliation runs found</Text>
              <Text tone="secondary">
                Daily reconciliation runs execute automatically at 07:00 WAT chunked per provider.
              </Text>
            </div>
          ) : (
            <div className="pk-table-wrap">
              <table className="pk-table">
                <thead>
                  <tr>
                    <th scope="col">Business Date</th>
                    <th scope="col">Provider</th>
                    <th scope="col">Status</th>
                    <th scope="col">Matched / Exceptions</th>
                    <th scope="col">Our records</th>
                    <th scope="col">Paystack records</th>
                    <th scope="col">Difference</th>
                    <th scope="col">Finished (Lagos)</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRuns.map((r) => {
                    const countGap = Math.abs(r.totalInternal - r.totalProvider);
                    return (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.businessDate}</td>
                        <td>
                          <span
                            className="pk-badge"
                            style={{
                              background: '#f0fdf4',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            {r.provider}
                          </span>
                        </td>
                        <td>{runStatusBadge(r.status, r.mismatchedCount)}</td>
                        <td>
                          <Text variant="body-sm">
                            {r.matchedCount} matched
                            {r.mismatchedCount > 0 && (
                              <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 6 }}>
                                · {r.mismatchedCount} exceptions
                              </span>
                            )}
                          </Text>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Text variant="body-sm">{r.totalInternal.toLocaleString()}</Text>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Text variant="body-sm">{r.totalProvider.toLocaleString()}</Text>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Text
                            variant="body-sm"
                            style={{
                              fontWeight: countGap > 0 ? 600 : 400,
                              color: countGap > 0 ? '#dc2626' : 'var(--pk-color-text-secondary)',
                            }}
                          >
                            {countGap.toLocaleString()}
                          </Text>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Text variant="caption" tone="secondary">
                            {r.finishedAt ? lagosTime.format(new Date(r.finishedAt)) : 'Running…'}
                          </Text>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Link
                            href={`/finance/reconciliation/${r.id}`}
                            className="pk-link"
                            style={{ fontWeight: 600 }}
                          >
                            View Items →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <Link
                href={`/finance?cursor=${encodeURIComponent(nextCursor)}${currentTab !== 'all' ? `&tab=${currentTab}` : ''}`}
                className="pk-link"
                style={{ fontWeight: 600 }}
              >
                Next Page →
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
