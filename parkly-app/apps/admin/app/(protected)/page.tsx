import type { AuditLogEntry } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { requireAccess } from '../../lib/auth/session';
import { publicEnv } from '../../lib/env';

// Mirrors the API's `audit:read` rule; the API enforces it regardless.
const AUDIT_READERS = new Set(['ADMIN_COMPLIANCE', 'SUPER_ADMIN']);

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Africa/Lagos',
});

export default async function AdminHome({
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
      <Text variant="heading-xl">Welcome{me.firstName ? `, ${me.firstName}` : ''}</Text>
      <Link className="pk-link" href="/kyb">
        KYB to review
      </Link>
      <Text variant="body-sm" tone="tertiary">
        Lot reviews (permits, prices, site visits, go-live) arrive next.
      </Text>

      <Text variant="heading-md" as="h2">
        Audit log
      </Text>
      {!page && (
        <Text tone="secondary">The audit log is visible to compliance staff and super admins.</Text>
      )}
      {page && (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">When (Lagos)</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
                <th scope="col">Actor</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => (
                <tr key={e.id}>
                  <td>{lagosTime.format(new Date(e.createdAt))}</td>
                  <td>
                    <code className="pk-code">{e.action}</code>
                  </td>
                  <td>
                    {e.entityType}
                    {e.entityId && (
                      <>
                        {' '}
                        <code className="pk-code">{e.entityId}</code>
                      </>
                    )}
                  </td>
                  <td>
                    {e.actorRole ?? 'system'}
                    {e.actorUserId && (
                      <>
                        {' '}
                        <code className="pk-code">{e.actorUserId}</code>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {page.items.length === 0 && (
                <tr>
                  <td colSpan={4}>No audit entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="pk-row">
        {cursor && (
          <Link className="pk-link" href="/">
            Newest entries
          </Link>
        )}
        {page?.nextCursor && (
          <Link className="pk-link" href={`/?cursor=${encodeURIComponent(page.nextCursor)}`}>
            Older entries
          </Link>
        )}
      </div>
    </main>
  );
}
