import type { Lot, SelfCheckinSetting } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { QrCode } from '../../../../../components/qr-code';
import { PrintButton } from '../../../../../components/self-checkin';
import { apiFetch, ApiProblem } from '../../../../../lib/api';
import { requireAccess } from '../../../../../lib/auth/session';
import { publicEnv } from '../../../../../lib/env';
import { lotOperatorId } from '../../operator';

export const metadata = { title: 'Entrance poster · Parkly for Operators' };

/** ADR 0016: the printable poster drivers scan to check themselves in and out. */
export default async function PosterPage({ params }: { params: Promise<{ lotId: string }> }) {
  const { me, accessToken } = await requireAccess();
  const operatorId = lotOperatorId(me);
  if (!operatorId) return null;
  const { lotId } = await params;
  const base = `/v1/operators/${operatorId}/lots/${encodeURIComponent(lotId)}`;
  let lot: Lot;
  let setting: SelfCheckinSetting;
  try {
    [lot, setting] = await Promise.all([
      apiFetch<Lot>(publicEnv().apiUrl, base, accessToken),
      apiFetch<SelfCheckinSetting>(publicEnv().apiUrl, `${base}/self-check-in`, accessToken),
    ]);
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }

  return (
    <main className="pk-page pk-poster">
      <Link className="pk-link pk-no-print" href={`/lots/${lotId}`}>
        ← Back to the lot
      </Link>
      {!setting.enabled && (
        <p className="pk-notice pk-notice--error pk-no-print" role="alert">
          Self check-in is off for this lot, so scanning this poster won’t work until you turn it
          on.
        </p>
      )}
      <Text variant="heading-xl">Booked with Parkly?</Text>
      <Text variant="heading-md" as="p">
        Scan this code in the Parkly app to check in when you arrive and to check out when you
        leave.
      </Text>
      <QrCode value={setting.gateCode} label={`Self check-in code for ${lot.name}`} />
      <Text>{lot.name}</Text>
      <Text tone="secondary">
        Open your booking in the Parkly app, tap “Check in yourself”, then point the camera here.
      </Text>
      <PrintButton />
    </main>
  );
}
