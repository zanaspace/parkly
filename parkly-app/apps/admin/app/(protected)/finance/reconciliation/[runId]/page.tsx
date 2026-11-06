import type { ReconciliationItem, ReconciliationRun } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResolveReconciliationItem } from '../../../../../components/resolve-reconciliation-item';
import { apiFetch, ApiProblem } from '../../../../../lib/api';
import { requireAccess } from '../../../../../lib/auth/session';
import { publicEnv } from '../../../../../lib/env';
import { formatKobo } from '../../../../../lib/lots/copy';

export const metadata = { title: 'Reconciliation Run Details · Parkly Admin' };

const FINANCE_READERS = new Set(['ADMIN_FINANCE', 'SUPER_ADMIN']);

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Africa/Lagos',
});

function resultBadge(result: ReconciliationItem['result']) {
  switch (result) {
    case 'MATCHED':
      return <span className="pk-badge pk-badge--approved">Matched</span>;
    case 'AUTO_FIXED':
      return (
        <span
          className="pk-badge"
          style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}
        >
          Auto Fixed
        </span>
      );
    case 'AMOUNT_MISMATCH':
      return (
        <span
          className="pk-badge pk-badge--submitted"
          style={{ background: '#fff1f0', color: '#cf1322', borderColor: '#ffa39e' }}
        >
          Amount Mismatch
        </span>
      );
    case 'STATUS_MISMATCH':
      return (
        <span
          className="pk-badge pk-badge--submitted"
          style={{ background: '#fff1f0', color: '#cf1322', borderColor: '#ffa39e' }}
        >
          Status Mismatch
        </span>
      );
    case 'MISSING_PROVIDER':
      return (
        <span
          className="pk-badge pk-badge--submitted"
          style={{ background: '#fffbe6', color: '#d46b08', borderColor: '#ffe58f' }}
        >
          Missing in Provider
        </span>
      );
    case 'MISSING_INTERNAL':
      return (
        <span
          className="pk-badge pk-badge--submitted"
          style={{ background: '#fffbe6', color: '#d46b08', borderColor: '#ffe58f' }}
        >
          Missing in Ledger
        </span>
      );
    default:
      return <span className="pk-badge">{result}</span>;
  }
}

export default async function ReconciliationRunDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ cursor?: string; result?: string; unresolvedOnly?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const canReadFinance = me.roles.some((r) => FINANCE_READERS.has(r.role));
  const { runId } = await params;
  const q = await searchParams;

  if (!canReadFinance) {
    return (
      <main className="pk-page pk-page--wide">
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">
            Reconciliation item details are restricted to ADMIN_FINANCE and SUPER_ADMIN roles.
          </Text>
        </div>
      </main>
    );
  }

  // 1. Fetch Run details
  let run: ReconciliationRun;
  try {
    run = await apiFetch<ReconciliationRun>(
      publicEnv().apiUrl,
      `/v1/admin/reconciliation/runs/${encodeURIComponent(runId)}`,
      accessToken,
    );
  } catch (err) {
    if (err instanceof ApiProblem && err.status === 404) notFound();
    throw err;
  }

  // 2. Fetch Run items
  const queryParts: string[] = ['limit=50'];
  if (q.cursor) queryParts.push(`cursor=${encodeURIComponent(q.cursor)}`);
  if (q.result) queryParts.push(`result=${encodeURIComponent(q.result)}`);
  if (q.unresolvedOnly === 'true') queryParts.push('unresolvedOnly=true');

  let items: ReconciliationItem[];
  let nextCursor: string | null;
  try {
    const res = await apiFetch<{ items: ReconciliationItem[]; nextCursor: string | null }>(
      publicEnv().apiUrl,
      `/v1/admin/reconciliation/runs/${encodeURIComponent(runId)}/items?${queryParts.join('&')}`,
      accessToken,
    );
    items = res.items;
    nextCursor = res.nextCursor;
  } catch {
    items = [];
    nextCursor = null;
  }

  const varianceKobo = Math.abs(run.totalInternal - run.totalProvider);
  const isBalanced = run.mismatchedCount === 0 && run.status === 'COMPLETED';

  return (
    <main className="pk-page pk-page--wide">
      <div>
        <Link
          href="/finance"
          className="pk-link"
          style={{ fontSize: '0.875rem', display: 'inline-block', marginBottom: '0.5rem' }}
        >
          ← Back to Finance & Reconciliation
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text variant="heading-xl">Reconciliation Run · {run.businessDate}</Text>
            <Text variant="body-sm" tone="secondary">
              Provider: <strong>{run.provider}</strong> · Run ID:{' '}
              <code className="pk-code">{run.id}</code>
            </Text>
          </div>
          <div>
            {isBalanced ? (
              <span
                className="pk-badge pk-badge--approved"
                style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}
              >
                Balanced
              </span>
            ) : (
              <span
                className="pk-badge pk-badge--submitted"
                style={{
                  fontSize: '0.875rem',
                  padding: '0.35rem 0.75rem',
                  background: '#fff1f0',
                  color: '#cf1322',
                  borderColor: '#ffa39e',
                }}
              >
                {run.mismatchedCount} Discrepancies
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Run Summary Card */}
      <div className="pk-card" style={{ padding: '1.25rem' }}>
        <Text variant="label-lg" style={{ fontWeight: 600 }}>
          Run Summary & Ledger Totals
        </Text>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
            gap: '1rem',
            marginTop: '0.5rem',
          }}
        >
          <div>
            <Text variant="caption" tone="secondary">
              Internal Ledger Total
            </Text>
            <Text variant="heading-md">{formatKobo(run.totalInternal)}</Text>
          </div>
          <div>
            <Text variant="caption" tone="secondary">
              Provider (Paystack) Total
            </Text>
            <Text variant="heading-md">{formatKobo(run.totalProvider)}</Text>
          </div>
          <div>
            <Text variant="caption" tone="secondary">
              Net Variance
            </Text>
            <Text variant="heading-md" style={{ color: varianceKobo > 0 ? '#dc2626' : 'inherit' }}>
              {formatKobo(varianceKobo)}
            </Text>
          </div>
          <div>
            <Text variant="caption" tone="secondary">
              Matched Transactions
            </Text>
            <Text variant="heading-md" style={{ color: '#16a34a' }}>
              {run.matchedCount}
            </Text>
          </div>
          <div>
            <Text variant="caption" tone="secondary">
              Exceptions & Mismatches
            </Text>
            <Text
              variant="heading-md"
              style={{ color: run.mismatchedCount > 0 ? '#dc2626' : 'inherit' }}
            >
              {run.mismatchedCount}
            </Text>
          </div>
        </div>

        {run.error && (
          <div className="pk-notice pk-notice--error" style={{ marginTop: '0.75rem' }}>
            <Text variant="body-sm" style={{ color: '#b91c1c' }}>
              Execution Error: {run.error}
            </Text>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="pk-tab-nav" style={{ marginTop: '0.5rem' }}>
        <Link
          href={`/finance/reconciliation/${run.id}`}
          className={`pk-tab-item ${!q.result && !q.unresolvedOnly ? 'pk-tab-item--active' : ''}`}
        >
          All Items
        </Link>
        <Link
          href={`/finance/reconciliation/${run.id}?unresolvedOnly=true`}
          className={`pk-tab-item ${q.unresolvedOnly === 'true' ? 'pk-tab-item--active' : ''}`}
        >
          Unresolved Exceptions
        </Link>
        <Link
          href={`/finance/reconciliation/${run.id}?result=AMOUNT_MISMATCH`}
          className={`pk-tab-item ${q.result === 'AMOUNT_MISMATCH' ? 'pk-tab-item--active' : ''}`}
        >
          Amount Mismatches
        </Link>
        <Link
          href={`/finance/reconciliation/${run.id}?result=MISSING_PROVIDER`}
          className={`pk-tab-item ${q.result === 'MISSING_PROVIDER' ? 'pk-tab-item--active' : ''}`}
        >
          Missing in Provider
        </Link>
        <Link
          href={`/finance/reconciliation/${run.id}?result=STATUS_MISMATCH`}
          className={`pk-tab-item ${q.result === 'STATUS_MISMATCH' ? 'pk-tab-item--active' : ''}`}
        >
          Status Mismatches
        </Link>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="pk-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Text variant="heading-sm">No items matching current filters</Text>
          <Text tone="secondary">
            All transactions for this query are reconciled or none exist.
          </Text>
        </div>
      ) : (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Result</th>
                <th scope="col">References</th>
                <th scope="col">Details & Amounts</th>
                <th scope="col">Logged (Lagos)</th>
                <th scope="col" style={{ minWidth: '18rem' }}>
                  Resolution & Audit
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const details = item.details as Record<string, unknown>;
                const internalKobo =
                  typeof details.internalAmountKobo === 'number'
                    ? details.internalAmountKobo
                    : null;
                const providerKobo =
                  typeof details.providerAmountKobo === 'number'
                    ? details.providerAmountKobo
                    : null;
                const diffKobo = typeof details.diffKobo === 'number' ? details.diffKobo : null;
                const internalStatus =
                  typeof details.internalStatus === 'string' ? details.internalStatus : null;
                const providerStatus =
                  typeof details.providerStatus === 'string' ? details.providerStatus : null;

                return (
                  <tr key={item.id}>
                    <td>{resultBadge(item.result)}</td>
                    <td>
                      <div>
                        <Text variant="caption" tone="secondary">
                          Provider Ref:
                        </Text>
                        <code className="pk-code" style={{ fontSize: '0.8rem', display: 'block' }}>
                          {item.providerReference}
                        </code>
                      </div>
                      {item.paymentId && (
                        <div style={{ marginTop: '0.25rem' }}>
                          <Text variant="caption" tone="secondary">
                            Payment ID:
                          </Text>
                          <code
                            className="pk-code"
                            style={{ fontSize: '0.75rem', opacity: 0.8, display: 'block' }}
                          >
                            {item.paymentId}
                          </code>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        {internalKobo !== null && (
                          <Text variant="body-sm">
                            <span style={{ color: 'var(--pk-color-text-secondary)' }}>Ledger:</span>{' '}
                            <strong>{formatKobo(internalKobo)}</strong>
                            {internalStatus && ` (${internalStatus})`}
                          </Text>
                        )}
                        {providerKobo !== null && (
                          <Text variant="body-sm">
                            <span style={{ color: 'var(--pk-color-text-secondary)' }}>
                              Provider:
                            </span>{' '}
                            <strong>{formatKobo(providerKobo)}</strong>
                            {providerStatus && ` (${providerStatus})`}
                          </Text>
                        )}
                        {diffKobo !== null && diffKobo !== 0 && (
                          <Text variant="body-sm" style={{ color: '#dc2626', fontWeight: 600 }}>
                            Variance: {formatKobo(Math.abs(diffKobo))}
                          </Text>
                        )}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Text variant="caption" tone="secondary">
                        {lagosTime.format(new Date(item.createdAt))}
                      </Text>
                    </td>
                    <td>
                      <ResolveReconciliationItem item={item} runId={run.id} />
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
            href={`/finance/reconciliation/${run.id}?cursor=${encodeURIComponent(nextCursor)}${q.result ? `&result=${encodeURIComponent(q.result)}` : ''}${q.unresolvedOnly ? '&unresolvedOnly=true' : ''}`}
            className="pk-link"
            style={{ fontWeight: 600 }}
          >
            Next Page →
          </Link>
        </div>
      )}
    </main>
  );
}
