import type { IncidentList, IncidentView, LotIncidentFlags } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { lagosShort } from '../../../lib/bookings/support';
import { publicEnv } from '../../../lib/env';
import { canManageIncidents, CATEGORY, incidentTone, STATUS } from '../../../lib/incidents/copy';

export const metadata = { title: 'Incidents · Parkly Admin' };

const TABS = [
  { key: 'active', label: 'Needs work', status: undefined },
  { key: 'OPEN', label: 'Open', status: 'OPEN' },
  { key: 'TRIAGED', label: 'Triaged', status: 'TRIAGED' },
  { key: 'RESOLVED', label: 'Resolved', status: 'RESOLVED' },
  { key: 'CLOSED', label: 'Closed', status: 'CLOSED' },
] as const;

/**
 * X-08 (FR-INC-001, FR-INC-004): the incident queue, worst severity first and
 * oldest first within it, with lots flagged for review (3 incidents in 30 days).
 */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const allowed = canManageIncidents(me.roles);
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const api = publicEnv().apiUrl;

  let items: IncidentView[] | null = null;
  let flags: LotIncidentFlags['items'] = [];
  if (allowed) {
    const q = active.status ? `?status=${active.status}` : '';
    [items, flags] = await Promise.all([
      apiFetch<IncidentList>(api, `/v1/admin/incidents${q}`, accessToken)
        .then((r) =>
          active.status
            ? r.items
            : r.items.filter((i) => i.status === 'OPEN' || i.status === 'TRIAGED'),
        )
        .catch(() => null),
      apiFetch<LotIncidentFlags>(api, '/v1/admin/incidents/lot-flags', accessToken)
        .then((r) => r.items)
        .catch(() => []),
    ]);
  }

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <div className="pk-rates-summary">
        <div>
          <Text variant="heading-xl">Incidents</Text>
          <Text variant="body-sm" tone="secondary">
            Worst first, then oldest. Respond within 15 minutes (S1), 1 hour (S2), 8 hours (S3) or
            48 hours (S4).
          </Text>
        </div>
        {allowed && (
          <Link className="pk-link" href="/incidents/new">
            Log an incident
          </Link>
        )}
      </div>

      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only support, ops and super admins work incidents.</Text>
        </div>
      ) : (
        <>
          {flags.length > 0 && (
            <section className="pk-card pk-stack" aria-labelledby="flags-heading">
              <Text variant="label-lg" as="h2" id="flags-heading">
                Car parks to review
              </Text>
              <ul className="pk-list">
                {flags.map((f) => (
                  <li key={f.lotId}>
                    <strong>{f.lotName}</strong> · {f.operatorName}: {f.incidentCount} incidents in
                    the last {f.windowDays} days.{' '}
                    <Link className="pk-link" href={`/lots/${f.lotId}`}>
                      Open the car park
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <nav aria-label="Incident status" className="pk-tab-nav">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === 'active' ? '/incidents' : `/incidents?tab=${t.key}`}
                className={`pk-tab-item${t.key === active.key ? ' pk-tab-item--active' : ''}`}
                aria-current={t.key === active.key ? 'page' : undefined}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {items === null ? (
            <Text role="status" tone="secondary">
              We couldn’t load incidents just now. Please refresh to try again.
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
                    <th scope="col">Level</th>
                    <th scope="col">Car park</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Status</th>
                    <th scope="col">Logged</th>
                    <th scope="col">Respond by</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className={`pk-badge ${incidentTone(i)}`}>{i.severityLabel}</span>
                      </td>
                      <td>
                        <Link className="pk-link" href={`/incidents/${i.id}`}>
                          {i.lotName}
                        </Link>
                        {i.bookingCode ? ` · ${i.bookingCode}` : ''}
                      </td>
                      <td>{CATEGORY[i.category]}</td>
                      <td>{STATUS[i.status]}</td>
                      <td>{lagosShort(i.createdAt)}</td>
                      <td>
                        {i.status === 'OPEN' && !i.triagedAt
                          ? `${lagosShort(i.triageDueAt)}${i.overdue ? ' · overdue' : ''}`
                          : '—'}
                      </td>
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
