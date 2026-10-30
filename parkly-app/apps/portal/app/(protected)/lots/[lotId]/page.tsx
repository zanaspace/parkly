import type { Lot, SelfCheckinSetting } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, LotsIcon } from '../../../../components/icons';
import { LotVisibilitySection } from '../../../../components/lot-visibility';
import {
  PermitSection,
  PricesSection,
  SubmitLotSection,
} from '../../../../components/lot-submission';
import { HoursEditor, LotForm, PhotoUploader } from '../../../../components/lots';
import { SelfCheckinSection } from '../../../../components/self-checkin';
import { apiFetch, ApiProblem } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';
import { lotOperatorId } from '../operator';

/** What the operator can expect in each status once the lot has left draft (doc 02 §3.3). */
const STATUS_NOTE: Record<Lot['status'], string> = {
  DRAFT: '',
  PENDING_VERIFICATION:
    'Submitted. Parkly is reviewing the permit, prices and photos and will arrange a site visit. It can’t be edited meanwhile.',
  LIVE: 'Live: drivers can find and book this lot.',
  PAUSED: 'Paused: hidden from drivers; existing bookings are honoured.',
  SUSPENDED: 'Suspended by Parkly: hidden from drivers. Contact Parkly support to resolve it.',
  ARCHIVED: 'Archived.',
};

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
  const base = `/v1/operators/${operatorId}/lots/${encodeURIComponent(lotId)}`;
  let lot: Lot;
  let selfCheckin: SelfCheckinSetting | null;
  try {
    [lot, selfCheckin] = await Promise.all([
      apiFetch<Lot>(publicEnv().apiUrl, base, accessToken),
      apiFetch<SelfCheckinSetting>(publicEnv().apiUrl, `${base}/self-check-in`, accessToken).catch(
        () => null,
      ),
    ]);
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const editable = lot.status === 'DRAFT';
  // FR-LOT-005: prices may change on a live or paused lot too (each change is approved first).
  const pricesEditable = ['DRAFT', 'LIVE', 'PAUSED'].includes(lot.status);
  const hoursEditable = ['DRAFT', 'LIVE', 'PAUSED'].includes(lot.status);
  const created = (await searchParams).created === '1';
  const isOwner = me.roles.some((r) => r.role === 'OPERATOR_OWNER' && r.operatorId === operatorId);
  const isManager = me.roles.some(
    (r) => r.role === 'OPERATOR_MANAGER' && r.operatorId === operatorId,
  );
  const canManage = isOwner || isManager;

  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-back-link" href="/lots">
        <ArrowLeftIcon size={16} />
        <span>Back to lots</span>
      </Link>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}
      >
        <LotsIcon size={22} style={{ color: 'var(--pk-color-text-brand)' }} />
        <Text variant="heading-xl">{lot.name}</Text>
      </div>
      {created && (
        <p className="pk-notice pk-notice--info" role="status">
          Lot created as a draft. Next: photos, opening hours, prices and the LASPA permit, then
          submit it for verification.
        </p>
      )}
      {lot.status === 'DRAFT' && lot.statusReason && (
        <p className="pk-notice pk-notice--error" role="alert">
          Parkly sent this lot back: “{lot.statusReason}”. Fix it and submit again.
        </p>
      )}
      {!editable && <Text tone="secondary">{STATUS_NOTE[lot.status]}</Text>}
      {lot.status === 'SUSPENDED' && lot.statusReason && (
        <p className="pk-notice pk-notice--error" role="alert">
          Reason: {lot.statusReason}
        </p>
      )}

      {/* FR-LOT-006: Search & Listing Visibility Control */}
      <LotVisibilitySection operatorId={operatorId} lot={lot} canManage={canManage} />

      <Text variant="heading-md" as="h2">
        Photos
      </Text>
      <PhotoUploader operatorId={operatorId} lot={lot} editable={editable} />

      <Text variant="heading-md" as="h2">
        Opening hours
      </Text>
      <HoursEditor operatorId={operatorId} lot={lot} editable={hoursEditable} />

      <Text variant="heading-md" as="h2">
        Prices
      </Text>
      <PricesSection operatorId={operatorId} lot={lot} editable={pricesEditable} />

      <Text variant="heading-md" as="h2">
        LASPA permit
      </Text>
      <PermitSection operatorId={operatorId} lot={lot} editable={editable} />

      {selfCheckin && (
        <>
          <Text variant="heading-md" as="h2">
            Self check-in
          </Text>
          <SelfCheckinSection
            operatorId={operatorId}
            lotId={lot.id}
            enabled={selfCheckin.enabled}
            isOwner={isOwner}
          />
        </>
      )}

      <Text variant="heading-md" as="h2">
        Details
      </Text>
      <LotForm operatorId={operatorId} lot={lot} editable={editable} />

      <Text variant="heading-md" as="h2">
        Submit for verification
      </Text>
      <SubmitLotSection operatorId={operatorId} lot={lot} />
    </main>
  );
}
