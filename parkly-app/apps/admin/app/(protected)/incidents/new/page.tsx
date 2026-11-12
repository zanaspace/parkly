import type { AdminLotSummary } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { NewIncidentForm } from '../../../../components/incident-forms';
import { apiFetch } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';
import { canManageIncidents } from '../../../../lib/incidents/copy';

export const metadata = { title: 'Log an incident · Parkly Admin' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FR-INC-001: log an incident. From a booking page it arrives with the booking
 * and its car park already chosen.
 */
export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ lotId?: string; bookingId?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const allowed = canManageIncidents(me.roles);
  const q = await searchParams;
  const lotId = q.lotId && UUID.test(q.lotId) ? q.lotId : undefined;
  const bookingId = q.bookingId && UUID.test(q.bookingId) ? q.bookingId : undefined;

  const lots: AdminLotSummary[] = allowed
    ? (
        await Promise.all(
          ['LIVE', 'SUSPENDED'].map((s) =>
            apiFetch<{ items: AdminLotSummary[] }>(
              publicEnv().apiUrl,
              `/v1/admin/lots?status=${s}`,
              accessToken,
            )
              .then((r) => r.items)
              .catch(() => [] as AdminLotSummary[]),
          ),
        )
      ).flat()
    : [];

  return (
    <main className="pk-page pk-stack">
      <Link className="pk-link" href="/incidents">
        ← Incidents
      </Link>
      <Text variant="heading-xl">Log an incident</Text>
      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only support, ops and super admins log incidents.</Text>
        </div>
      ) : (
        <div className="pk-card">
          <NewIncidentForm
            lots={lots.map((l) => ({ id: l.id, name: l.name, operatorName: l.operatorName }))}
            defaultLotId={lotId}
            bookingId={bookingId}
          />
        </div>
      )}
    </main>
  );
}
