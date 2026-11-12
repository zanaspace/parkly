import type { IncidentDetail } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IncidentNoteForm, IncidentSteps } from '../../../../components/incident-forms';
import { apiFetch, ApiProblem } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { lagosShort } from '../../../../lib/bookings/support';
import { publicEnv } from '../../../../lib/env';
import {
  canManageIncidents,
  CATEGORY,
  incidentTone,
  nextActions,
  STATUS,
} from '../../../../lib/incidents/copy';

export const metadata = { title: 'Incident · Parkly Admin' };

/** X-08 detail: what happened, who has it, notes, and the next step (doc 03 §4.5). */
export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { me, accessToken } = await requireAccess();
  if (!canManageIncidents(me.roles)) notFound();
  const { id } = await params;
  let detail: IncidentDetail;
  try {
    detail = await apiFetch<IncidentDetail>(
      publicEnv().apiUrl,
      `/v1/admin/incidents/${encodeURIComponent(id)}`,
      accessToken,
    );
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const { incident: i, notes } = detail;

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <Link className="pk-link" href="/incidents">
        ← Incidents
      </Link>
      <div>
        <Text variant="heading-xl" as="h1">
          <span className={`pk-badge ${incidentTone(i)}`}>{i.severityLabel}</span>{' '}
          {CATEGORY[i.category]} at {i.lotName}
        </Text>
        <Text tone="secondary">
          {STATUS[i.status]} · logged {lagosShort(i.createdAt)} by {i.reporterRole}
          {i.status === 'OPEN' && !i.triagedAt
            ? ` · respond by ${lagosShort(i.triageDueAt)}${i.overdue ? ' (overdue)' : ''}`
            : ''}
        </Text>
      </div>

      <div className="pk-support-grid">
        <section className="pk-card pk-stack" aria-labelledby="what-heading">
          <Text variant="label-lg" as="h2" id="what-heading">
            What happened
          </Text>
          <Text>{i.description}</Text>
          <dl className="pk-support-facts">
            <div>
              <dt>Car park</dt>
              <dd>
                <Link className="pk-link" href={`/lots/${i.lotId}`}>
                  {i.lotName}
                </Link>
              </dd>
            </div>
            {i.bookingId && (
              <div>
                <dt>Booking</dt>
                <dd>
                  <Link className="pk-link" href={`/bookings/${i.bookingId}`}>
                    {i.bookingCode}
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt>Owner</dt>
              <dd>
                {i.assigneeId
                  ? i.assigneeId === me.id
                    ? 'You'
                    : 'Another staff member'
                  : 'Nobody yet'}
              </dd>
            </div>
            {i.resolution && (
              <div>
                <dt>Resolution</dt>
                <dd>{i.resolution}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="pk-card pk-stack" aria-labelledby="step-heading">
          <Text variant="label-lg" as="h2" id="step-heading">
            Next step
          </Text>
          {nextActions(i.status).length === 0 ? (
            <Text tone="secondary">This incident is closed.</Text>
          ) : (
            <IncidentSteps incidentId={i.id} steps={nextActions(i.status)} />
          )}
        </section>
      </div>

      <section className="pk-card pk-stack" aria-labelledby="notes-heading">
        <Text variant="label-lg" as="h2" id="notes-heading">
          Notes
        </Text>
        {notes.length === 0 ? (
          <Text tone="secondary">No notes yet.</Text>
        ) : (
          <ul className="pk-list">
            {notes.map((n) => (
              <li key={n.id}>
                <Text variant="body-sm" tone="tertiary">
                  {lagosShort(n.createdAt)} · {n.authorId === me.id ? 'You' : 'Staff'}
                </Text>
                <Text>{n.body}</Text>
              </li>
            ))}
          </ul>
        )}
        {i.status !== 'CLOSED' && <IncidentNoteForm incidentId={i.id} />}
      </section>
    </main>
  );
}
