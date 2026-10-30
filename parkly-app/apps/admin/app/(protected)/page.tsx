import type { AdminLotSummary, AdminOperatorSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { AuditIcon, KybIcon, LotsIcon } from '../../components/icons';
import { apiFetch } from '../../lib/api';
import { requireAccess } from '../../lib/auth/session';
import { publicEnv } from '../../lib/env';

export const metadata = { title: 'Dashboard · Parkly Admin' };

const AUDIT_READERS = new Set(['ADMIN_COMPLIANCE', 'SUPER_ADMIN']);

export default async function AdminHome() {
  const { me, accessToken } = await requireAccess();
  const canReadAudit = me.roles.some((r) => AUDIT_READERS.has(r.role));
  const primaryRole = me.roles[0]?.role ?? 'ADMIN';

  // Load operational queues in parallel
  const [kybRes, lotsRes] = await Promise.all([
    apiFetch<{ items: AdminOperatorSummary[] }>(
      publicEnv().apiUrl,
      '/v1/admin/operators?kybStatus=SUBMITTED',
      accessToken,
    ).catch(() => ({ items: [] })),
    apiFetch<{ items: AdminLotSummary[] }>(
      publicEnv().apiUrl,
      '/v1/admin/lots?status=PENDING_VERIFICATION',
      accessToken,
    ).catch(() => ({ items: [] })),
  ]);

  const pendingKybCount = kybRes.items.length;
  const pendingLotsCount = lotsRes.items.length;

  return (
    <main className="pk-page pk-page--wide">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <Text variant="heading-xl">Welcome back{me.firstName ? `, ${me.firstName}` : ''}</Text>
          <Text variant="body-sm" tone="secondary">
            Parkly Administrative Console · Role:{' '}
            <strong style={{ color: 'var(--pk-color-text-brand)' }}>{primaryRole}</strong>
          </Text>
        </div>
      </div>

      <Text variant="heading-md" as="h2">
        Operational Queues & Reviews
      </Text>

      <div className="pk-stat-grid">
        {/* KYB Review Card */}
        <div className="pk-stat-card">
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <KybIcon size={19} />
                <Text variant="label-lg" tone="brand">
                  Operator KYB Review
                </Text>
              </div>
              <span
                className={`pk-badge ${pendingKybCount > 0 ? 'pk-badge--submitted' : 'pk-badge--approved'}`}
              >
                {pendingKybCount > 0 ? 'Action Needed' : 'All Clear'}
              </span>
            </div>
            <div className="pk-stat-count">{pendingKybCount}</div>
            <Text
              variant="body-sm"
              tone="secondary"
              style={{ marginTop: '0.5rem', display: 'block' }}
            >
              Operators waiting for business identity, CAC document, and Paystack settlement
              verification.
            </Text>
          </div>
          <Link
            className="pk-nav-link pk-nav-link--active"
            href="/kyb"
            style={{ justifyContent: 'center' }}
          >
            Open KYB Queue ({pendingKybCount}) →
          </Link>
        </div>

        {/* Lot Verification Card */}
        <div className="pk-stat-card">
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <LotsIcon size={19} />
                <Text variant="label-lg" tone="brand">
                  Lot Verification & Permits
                </Text>
              </div>
              <span
                className={`pk-badge ${pendingLotsCount > 0 ? 'pk-badge--submitted' : 'pk-badge--approved'}`}
              >
                {pendingLotsCount > 0 ? 'Action Needed' : 'All Clear'}
              </span>
            </div>
            <div className="pk-stat-count">{pendingLotsCount}</div>
            <Text
              variant="body-sm"
              tone="secondary"
              style={{ marginTop: '0.5rem', display: 'block' }}
            >
              Car parks waiting for LASPA permit check, on-site guard inspection, photos, and live
              rate approval.
            </Text>
          </div>
          <Link
            className="pk-nav-link pk-nav-link--active"
            href="/lots?status=PENDING_VERIFICATION"
            style={{ justifyContent: 'center' }}
          >
            Review Lots Queue ({pendingLotsCount}) →
          </Link>
        </div>

        {/* Security & Audit Card */}
        <div className="pk-stat-card">
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <AuditIcon size={19} />
                <Text variant="label-lg" tone="brand">
                  Compliance Audit Trail
                </Text>
              </div>
              <span className="pk-badge pk-badge--verified">NDPA Compliant</span>
            </div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--pk-color-text-primary)',
                margin: '0.5rem 0',
              }}
            >
              Append-Only Ledger
            </div>
            <Text variant="body-sm" tone="secondary">
              Review privileged administrative events, role changes, session revokes, and
              verification records.
            </Text>
          </div>
          {canReadAudit ? (
            <Link
              className="pk-nav-link"
              href="/audit-logs"
              style={{ justifyContent: 'center', background: 'var(--pk-color-bg-subtle)' }}
            >
              Inspect Audit Log →
            </Link>
          ) : (
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              Restricted to Compliance & Super Admins
            </Text>
          )}
        </div>
      </div>
    </main>
  );
}
