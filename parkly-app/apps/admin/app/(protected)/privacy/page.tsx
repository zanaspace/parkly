import type { DataRequestList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { lagosShort } from '../../../lib/bookings/support';
import { publicEnv } from '../../../lib/env';
import { accountNote, canReadDataRequests, STATUS, TABS, TYPE } from '../../../lib/privacy/copy';

export const metadata = { title: 'Privacy requests · Parkly Admin' };

/**
 * NFR-PRIV-001: everything people have asked about their data, and when each is
 * due. A person shows as first name only. Closing an account is carried out by the
 * nightly erasure job once the 30 days are up; copies of data are made by the
 * driver in the app. This page is for watching the dates, not for acting.
 */
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const allowed = canReadDataRequests(me.roles);
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const items = allowed
    ? await apiFetch<DataRequestList>(
        publicEnv().apiUrl,
        `/v1/admin/data-requests${active.status ? `?status=${active.status}` : ''}`,
        accessToken,
      )
        .then((r) => r.items)
        .catch(() => null)
    : null;

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <div>
        <Text variant="heading-xl">Privacy requests</Text>
        <Text variant="body-sm" tone="secondary">
          What people have asked about their data, and by when. Account closures wait 30 days, then
          the nightly job erases them.
        </Text>
      </div>

      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only compliance and super admins see privacy requests.</Text>
        </div>
      ) : (
        <>
          <nav aria-label="Request status" className="pk-tab-nav">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === 'open' ? '/privacy' : `/privacy?tab=${t.key}`}
                className={`pk-tab-item${t.key === active.key ? ' pk-tab-item--active' : ''}`}
                aria-current={t.key === active.key ? 'page' : undefined}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {items === null ? (
            <Text role="status" tone="secondary">
              We couldn’t load requests just now. Please refresh to try again.
            </Text>
          ) : items.length === 0 ? (
            <div className="pk-card">
              <Text>Nothing here.</Text>
            </div>
          ) : (
            <div className="pk-table-wrap">
              <table className="pk-table">
                <thead>
                  <tr>
                    <th scope="col">Request</th>
                    <th scope="col">Who</th>
                    <th scope="col">Status</th>
                    <th scope="col">Asked</th>
                    <th scope="col">Due</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{TYPE[i.type]}</td>
                      <td>{i.userFirstName ?? '—'}</td>
                      <td>{STATUS[i.status]}</td>
                      <td>{lagosShort(i.createdAt)}</td>
                      <td>
                        {lagosShort(i.dueAt)}
                        {i.overdue ? (
                          <>
                            {' '}
                            <span className="pk-badge pk-badge--rejected">Overdue</span>
                          </>
                        ) : null}
                      </td>
                      <td>{accountNote(i) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
