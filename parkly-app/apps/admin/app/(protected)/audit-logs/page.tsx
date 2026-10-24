import type { AuditLogEntry } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Audit Logs · Parkly Admin' };

// Mirrors the API's `audit:read` rule; the API enforces it regardless.
const AUDIT_READERS = new Set(['ADMIN_COMPLIANCE', 'SUPER_ADMIN']);

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Africa/Lagos',
});

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const canReadAudit = me.roles.some((r) => AUDIT_READERS.has(r.role));
  const { cursor } = await searchParams;

  const page = canReadAudit
    ? await apiFetch<{ items: AuditLogEntry[]; nextCursor: string | null }>(
        publicEnv().apiUrl,
        `/v1/admin/audit-logs?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        accessToken,
      )
    : null;

  return (
    <main className="pk-page pk-page--wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text variant="heading-xl">Compliance Audit Trail</Text>
          <Text variant="body-sm" tone="secondary">
            Append-only security log recording every administrative decision and sensitive event.
          </Text>
        </div>
      </div>

      {!canReadAudit && (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">
            The full audit trail is restricted to compliance personnel and super admins under NDPA rules.
          </Text>
        </div>
      )}

      {canReadAudit && page && (
        <>
          <div className="pk-table-wrap">
            <table className="pk-table">
              <thead>
                <tr>
                  <th scope="col">When (Lagos Time)</th>
                  <th scope="col">Action Taken</th>
                  <th scope="col">Target Entity</th>
                  <th scope="col">Actor / Role</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Text variant="body-sm">{lagosTime.format(new Date(e.createdAt))}</Text>
                    </td>
                    <td>
                      <code className="pk-code" style={{ color: 'var(--pk-color-text-brand)', fontWeight: 600 }}>
                        {e.action}
                      </code>
                    </td>
                    <td>
                      <Text variant="body-sm" style={{ fontWeight: 500 }}>
                        {e.entityType}
                      </Text>
                      {e.entityId && (
                        <div>
                          <code className="pk-code" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {e.entityId}
                          </code>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="pk-badge pk-badge--submitted" style={{ marginBottom: 4 }}>
                        {e.actorRole ?? 'SYSTEM'}
                      </span>
                      {e.actorUserId && (
                        <div>
                          <code className="pk-code" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {e.actorUserId}
                          </code>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {page.items.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Text tone="secondary">No audit entries recorded yet.</Text>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pk-row" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
            <div>
              {cursor ? (
                <Link className="pk-nav-link" href="/audit-logs">
                  ← Back to First Page
                </Link>
              ) : null}
            </div>
            <div>
              {page.nextCursor ? (
                <Link
                  className="pk-nav-link pk-nav-link--active"
                  href={`/audit-logs?cursor=${encodeURIComponent(page.nextCursor)}`}
                >
                  Next 50 Entries →
                </Link>
              ) : (
                <Text variant="caption" tone="tertiary">
                  End of audit records
                </Text>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
