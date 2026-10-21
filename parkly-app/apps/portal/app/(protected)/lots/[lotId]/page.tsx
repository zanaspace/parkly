import type { Lot } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HoursEditor, LotForm, PhotoUploader } from '../../../../components/lots';
import { apiFetch, ApiProblem } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';
import { lotOperatorId } from '../operator';

export const metadata = { title: 'Lot · Parkly for Operators' };

export default async function LotPage({
  params,
  searchParams,
}: {
  params: Promise<{ lotId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const operatorId = lotOperatorId(me);
  if (!operatorId) return null;
  const { lotId } = await params;
  let lot: Lot;
  try {
    lot = await apiFetch<Lot>(
      publicEnv().apiUrl,
      `/v1/operators/${operatorId}/lots/${encodeURIComponent(lotId)}`,
      accessToken,
    );
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const editable = lot.status === 'DRAFT';
  const created = (await searchParams).created === '1';

  return (
    <main className="pk-page">
      <Link className="pk-link" href="/lots">
        ← Your lots
      </Link>
      <Text variant="heading-xl">{lot.name}</Text>
      {created && (
        <p className="pk-notice pk-notice--info" role="status">
          Lot created as a draft. Add opening hours and at least 3 photos next.
        </p>
      )}
      {!editable && (
        <Text tone="secondary">This lot has been submitted, so it can’t be edited right now.</Text>
      )}

      <Text variant="heading-md" as="h2">
        Photos
      </Text>
      <PhotoUploader operatorId={operatorId} lot={lot} editable={editable} />

      <Text variant="heading-md" as="h2">
        Opening hours
      </Text>
      <HoursEditor operatorId={operatorId} lot={lot} editable={editable} />

      <Text variant="heading-md" as="h2">
        Details
      </Text>
      <LotForm operatorId={operatorId} lot={lot} editable={editable} />
    </main>
  );
}
