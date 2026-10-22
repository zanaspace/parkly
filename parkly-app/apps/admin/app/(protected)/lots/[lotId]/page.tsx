import type { AdminLotDetail, RatePlan } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  OpenPermitButton,
  PermitDecision,
  PhotoDecision,
  PriceDecision,
  StatusAction,
  VisitDecision,
  VisitForm,
} from '../../../../components/lot-review';
import { apiFetch, ApiProblem } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';
import { CHECK_LABEL, describePrice, PROBLEM_TEXT } from '../../../../lib/lots/copy';

export const metadata = { title: 'Review lot · Parkly Admin' };

// Mirror the API's rules so each person sees the actions they can take; the API enforces them.
const VERIFIERS = new Set(['ADMIN_OPS', 'SUPER_ADMIN']);
const PRICE_REVIEWERS = VERIFIERS;
const REINSTATERS = VERIFIERS;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The lot lists live prices, changes waiting for approval and the latest rejected change. */
const PRICE_STATUS: Record<RatePlan['status'], string> = {
  ACTIVE: 'live',
  PENDING_APPROVAL: 'awaiting approval',
  REJECTED: 'not approved',
  RETIRED: 'retired',
  DRAFT: 'draft',
};
const lagos = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section className="pk-card" aria-labelledby={id}>
      <Text variant="heading-md" as="h2" id={id}>
        {title}
      </Text>
      {children}
    </section>
  );
}

/** X-03/X-04/X-06: everything needed to review a lot, then take it live. */
export default async function LotReviewPage({ params }: { params: Promise<{ lotId: string }> }) {
  const { me, accessToken } = await requireAccess();
  const { lotId } = await params;
  let detail: AdminLotDetail;
  try {
    detail = await apiFetch<AdminLotDetail>(
      publicEnv().apiUrl,
      `/v1/admin/lots/${encodeURIComponent(lotId)}`,
      accessToken,
    );
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const { lot, operator, photos, verification: visit, listability } = detail;
  const roles = new Set(me.roles.map((r) => r.role));
  const canVerify = [...roles].some((r) => VERIFIERS.has(r));
  const canPrice = [...roles].some((r) => PRICE_REVIEWERS.has(r));
  const canReinstate = [...roles].some((r) => REINSTATERS.has(r));
  const permit = lot.permit;
  const permitOpen = permit && (permit.status === 'SUBMITTED' || permit.status === 'IN_REVIEW');
  const visitOpen = visit && (visit.status === 'SUBMITTED' || visit.status === 'IN_REVIEW');
  const ownVisit = visit?.inspectorUserId === me.id;

  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-link" href={`/lots?status=${lot.status}`}>
        ← Lots
      </Link>
      <Text variant="heading-xl">{lot.name}</Text>
      <Text tone="secondary">
        {operator.legalName} · {lot.status.replace('_', ' ').toLowerCase()}
        {lot.statusReason ? ` · “${lot.statusReason}”` : ''}
      </Text>
      {operator.kybStatus !== 'APPROVED' && (
        <p className="pk-notice pk-notice--error" role="alert">
          The operator’s KYB is {operator.kybStatus.toLowerCase().replace('_', ' ')}. The lot can’t
          go live until KYB is approved.{' '}
          <Link className="pk-link" href={`/kyb/${operator.id}`}>
            Open KYB
          </Link>
        </p>
      )}

      <Section title="Lot details">
        <table className="pk-table">
          <tbody>
            <tr>
              <th scope="row">Address</th>
              <td>
                {lot.addressLine}
                {lot.area ? `, ${lot.area}` : ''}
                {lot.lga ? ` (${lot.lga})` : ''}
              </td>
            </tr>
            <tr>
              <th scope="row">Map pin</th>
              <td>
                <a
                  className="pk-link"
                  href={`https://www.google.com/maps?q=${lot.location.lat},${lot.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {lot.location.lat.toFixed(5)}, {lot.location.lng.toFixed(5)}
                </a>
              </td>
            </tr>
            <tr>
              <th scope="row">Spaces</th>
              <td>
                {lot.capacityTotal} total, {lot.capacityBookable} on Parkly
              </td>
            </tr>
            <tr>
              <th scope="row">Amenities</th>
              <td>{lot.amenities.join(', ') || '—'}</td>
            </tr>
            <tr>
              <th scope="row">Opening hours</th>
              <td>
                {lot.openingHours
                  .map((d) =>
                    d.is24h
                      ? `${WEEKDAYS[d.weekday]} 24h`
                      : `${WEEKDAYS[d.weekday]} ${d.opensAt}–${d.closesAt}`,
                  )
                  .join(' · ') || 'Not set'}
              </td>
            </tr>
            <tr>
              <th scope="row">Entrance</th>
              <td>{lot.entranceNotes ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="LASPA permit">
        {permit ? (
          <>
            <Text>
              {permit.permitNumber} · issued {permit.issuedAt} · expires {permit.expiresAt} ·{' '}
              <strong>{permit.status.toLowerCase().replace('_', ' ')}</strong>
            </Text>
            {permit.rejectionReason && (
              <Text tone="secondary">Rejected: {permit.rejectionReason}</Text>
            )}
            {detail.permitReviewNote && (
              <Text tone="secondary">LASPA check: {detail.permitReviewNote}</Text>
            )}
            <div className="pk-row">
              <OpenPermitButton permitId={permit.id} />
            </div>
            {permitOpen && <PermitDecision lotId={lot.id} permitId={permit.id} />}
          </>
        ) : (
          <Text tone="secondary">No permit uploaded.</Text>
        )}
      </Section>

      <Section title="Prices">
        {lot.ratePlans.length === 0 && <Text tone="secondary">No prices.</Text>}
        <ul className="pk-list">
          {lot.ratePlans.map((p) => (
            <li key={p.id} className="pk-form">
              <Text>
                {p.product.toLowerCase()}: {describePrice(p)} ·{' '}
                <strong>{PRICE_STATUS[p.status]}</strong>
              </Text>
              {p.status === 'REJECTED' && p.rejectionReason && (
                <Text variant="body-sm" tone="secondary">
                  Reason given: {p.rejectionReason}. The operator can submit a new price.
                </Text>
              )}
              {p.status === 'PENDING_APPROVAL' && canPrice && (
                <PriceDecision lotId={lot.id} ratePlanId={p.id} />
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Photos (${photos.length})`}>
        <Text variant="body-sm" tone="tertiary">
          Approved photos are copied to public storage for drivers. Reject photos that show people’s
          faces, number plates or anything misleading.
        </Text>
        <ul className="pk-photo-grid">
          {photos.map((p, i) => (
            <li key={p.id} className="pk-form">
              {/* Signed 5-minute Storage links; next/image would cache them past expiry. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pk-photo" src={p.url} alt={`Lot photo ${i + 1}`} />
              <Text variant="body-sm">{p.status.toLowerCase()}</Text>
              {p.status === 'PENDING' && <PhotoDecision lotId={lot.id} photoId={p.id} />}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Site visit">
        {visit && (
          <>
            <Text>
              {lagos.format(new Date(visit.inspectedAt))} · {visit.capacityCounted} spaces counted ·{' '}
              <strong>{visit.status.toLowerCase().replace('_', ' ')}</strong>
              {visit.status === 'APPROVED' ? ` · valid until ${visit.validUntil}` : ''}
            </Text>
            {visit.rejectionReason && (
              <Text tone="secondary">Rejected: {visit.rejectionReason}</Text>
            )}
            <ul className="pk-list">
              {visit.items.map((i) => (
                <li key={i.item}>
                  {i.result === 'PASS' ? '✓' : i.result === 'FAIL' ? '✗' : '–'}{' '}
                  {CHECK_LABEL[i.item]}
                  {i.comment ? ` — ${i.comment}` : ''}
                </li>
              ))}
            </ul>
            {visit.notes && <Text tone="secondary">{visit.notes}</Text>}
            {visitOpen && canVerify && ownVisit && detail.fourEyesVerification && (
              <Text tone="secondary">
                You recorded this visit, so another ops person reviews it.
              </Text>
            )}
            {visitOpen && canVerify && !(ownVisit && detail.fourEyesVerification) && (
              <VisitDecision lotId={lot.id} verificationId={visit.id} />
            )}
          </>
        )}
        {!visitOpen && canVerify && lot.status !== 'DRAFT' && lot.status !== 'ARCHIVED' && (
          <details>
            <summary className="pk-link">
              {visit ? 'Record a new visit' : 'Record the visit'}
            </summary>
            <VisitForm lotId={lot.id} capacityTotal={lot.capacityTotal} />
          </details>
        )}
        {!visit && !canVerify && <Text tone="secondary">No visit recorded yet.</Text>}
      </Section>

      <Section title="Status">
        {lot.status === 'PENDING_VERIFICATION' && (
          <>
            {listability.listable ? (
              <Text>Everything is approved. The lot can go live.</Text>
            ) : (
              <>
                <Text>Before it can go live:</Text>
                <ul className="pk-list">
                  {listability.problems.map((p) => (
                    <li key={p}>• {PROBLEM_TEXT[p]}</li>
                  ))}
                </ul>
              </>
            )}
            {canReinstate && (
              <StatusAction
                lotId={lot.id}
                status="LIVE"
                label="Go live"
                needsReason={false}
                variant="primary"
                disabled={!listability.listable}
              />
            )}
            {canReinstate && (
              <details>
                <summary className="pk-link">Send back to the operator</summary>
                <StatusAction lotId={lot.id} status="DRAFT" label="Send back" needsReason />
              </details>
            )}
          </>
        )}
        {(lot.status === 'LIVE' || lot.status === 'PAUSED') && (
          <details>
            <summary className="pk-link">Suspend this lot</summary>
            <Text variant="body-sm" tone="tertiary">
              The lot disappears from search at once. Existing bookings are honoured.
            </Text>
            <StatusAction lotId={lot.id} status="SUSPENDED" label="Suspend" needsReason />
          </details>
        )}
        {lot.status === 'SUSPENDED' && canReinstate && (
          <StatusAction
            lotId={lot.id}
            status="LIVE"
            label="Reinstate"
            needsReason
            variant="primary"
          />
        )}
        {lot.status !== 'LIVE' && lot.status !== 'ARCHIVED' && (
          <details>
            <summary className="pk-link">Archive this lot</summary>
            <StatusAction lotId={lot.id} status="ARCHIVED" label="Archive" needsReason />
          </details>
        )}
      </Section>
    </main>
  );
}
