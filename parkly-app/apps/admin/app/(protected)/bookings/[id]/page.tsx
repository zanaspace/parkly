import type { SupportBookingDetail } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import {
  CancelBookingForm,
  RefundForm,
  ResendTicketButton,
} from '../../../../components/booking-actions';
import { RevealContact } from '../../../../components/reveal-contact';
import { WaiveOverstayForm } from '../../../../components/waive-overstay';
import { apiFetch, ApiProblem } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { canManageIncidents } from '../../../../lib/incidents/copy';
import { canWaive, overstayOwed } from '../../../../lib/bookings/code';
import { canCancel, canRefund, canSupportRefund } from '../../../../lib/bookings/money';
import { lagosShort } from '../../../../lib/bookings/support';
import { publicEnv } from '../../../../lib/env';
import { formatKobo } from '../../../../lib/lots/copy';

export const metadata = { title: 'Booking · Parkly Admin' };

const OVERSTAY_TEXT: Record<NonNullable<SupportBookingDetail['overstay']>['status'], string> = {
  NONE: 'None',
  DUE: 'Due (the driver has 24 hours)',
  UNPAID: 'Unpaid: blocking new bookings',
  PAID: 'Paid',
  WAIVED: 'Waived',
};

/**
 * X-07 (FR-ADM-002): one booking for support. The driver shows as first name,
 * masked phone and plate; the full phone or email needs a reason and is logged.
 * The timeline is every status change, payment, refund and gate event.
 */
export default async function SupportBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { me, accessToken } = await requireAccess();
  const { id } = await params;
  let detail: SupportBookingDetail;
  try {
    detail = await apiFetch<SupportBookingDetail>(
      publicEnv().apiUrl,
      `/v1/admin/bookings/${encodeURIComponent(id)}/support`,
      accessToken,
    );
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const { booking: b, overstay, timeline } = detail;
  const live = b.status === 'CONFIRMED' || b.status === 'CHECKED_IN';
  const cancellable = b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT';
  const isFinance = canRefund(me.roles);
  const supportCanRefund =
    !isFinance && canSupportRefund(me.roles) && detail.supportRefundLeftKobo > 0;
  const showActions =
    (canCancel(me.roles) && (cancellable || live)) ||
    (isFinance && detail.refundableKobo > 0) ||
    supportCanRefund;

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <Link className="pk-link" href="/bookings">
        ← Bookings
      </Link>
      <div>
        <Text variant="heading-xl" as="h1">
          {b.code}
        </Text>
        <Text tone="secondary">
          {b.lotName} · {b.operatorName} · {lagosShort(b.startAt)} → {lagosShort(b.endAt)}
        </Text>
      </div>

      <div className="pk-support-grid">
        <section className="pk-card pk-stack" aria-labelledby="booking-heading">
          <Text variant="label-lg" as="h2" id="booking-heading">
            Booking
          </Text>
          <dl className="pk-support-facts">
            <dt>Status</dt>
            <dd>
              <span className="pk-badge pk-badge--submitted">
                {b.status.replace('_', ' ').toLowerCase()}
              </span>
            </dd>
            <dt>Paid</dt>
            <dd>{formatKobo(b.totalKobo)}</dd>
            <dt>Plate</dt>
            <dd>{b.plate ?? '—'}</dd>
            <dt>Overstay</dt>
            <dd>
              {overstay && overstay.amountKobo > 0
                ? `${overstay.minutes} min, ${formatKobo(overstay.amountKobo)}. ${OVERSTAY_TEXT[overstay.status]}`
                : 'None'}
            </dd>
          </dl>
          {overstayOwed(overstay) && canWaive(me.roles) && (
            <WaiveOverstayForm bookingId={b.id} amount={formatKobo(overstay?.amountKobo ?? 0)} />
          )}
        </section>

        <section className="pk-card pk-stack" aria-labelledby="driver-heading">
          <Text variant="label-lg" as="h2" id="driver-heading">
            Driver
          </Text>
          <dl className="pk-support-facts">
            <dt>Name</dt>
            <dd>{b.driver.firstName ?? '—'}</dd>
            <dt>Phone</dt>
            <dd>
              {b.driver.phoneMasked ? (
                <RevealContact bookingId={b.id} field="phone" masked={b.driver.phoneMasked} />
              ) : (
                '—'
              )}
            </dd>
            <dt>Email</dt>
            <dd>
              {b.driver.hasEmail ? (
                <RevealContact bookingId={b.id} field="email" masked="Hidden" />
              ) : (
                '—'
              )}
            </dd>
          </dl>
          <Text variant="caption" tone="tertiary">
            Revealing a phone or email records your name, the time and your reason in the audit log.
          </Text>
        </section>
      </div>

      {canManageIncidents(me.roles) && (
        <Text variant="body-sm">
          <Link className="pk-link" href={`/incidents/new?lotId=${b.lotId}&bookingId=${b.id}`}>
            Log an incident about this booking
          </Link>
        </Text>
      )}

      {showActions && (
        <section className="pk-card pk-stack" aria-labelledby="actions-heading">
          <Text variant="label-lg" as="h2" id="actions-heading">
            Actions
          </Text>
          <div className="pk-support-grid">
            {canCancel(me.roles) && live && <ResendTicketButton bookingId={b.id} />}
            {canCancel(me.roles) && cancellable && (
              <CancelBookingForm bookingId={b.id} idempotencyKey={randomUUID()} />
            )}
            {isFinance && detail.refundableKobo > 0 && (
              <RefundForm
                bookingId={b.id}
                idempotencyKey={randomUUID()}
                refundable={formatKobo(detail.refundableKobo)}
                threshold={formatKobo(detail.refundApprovalThresholdKobo)}
              />
            )}
            {supportCanRefund && (
              <RefundForm
                bookingId={b.id}
                idempotencyKey={randomUUID()}
                refundable={formatKobo(detail.supportRefundLeftKobo)}
                threshold={formatKobo(detail.supportRefundLeftKobo)}
                helperText={`Support may refund up to ${formatKobo(detail.supportRefundLeftKobo)} on this booking; larger amounts need finance.`}
              />
            )}
          </div>
          <Text variant="caption" tone="tertiary">
            Every action is recorded in the audit log with your reason.
          </Text>
        </section>
      )}

      <section aria-labelledby="timeline-heading" className="pk-stack">
        <Text variant="heading-md" as="h2" id="timeline-heading">
          Timeline
        </Text>
        <ol className="pk-timeline">
          {timeline.map((e, i) => (
            <li key={`${e.type}-${i}`} className={`pk-timeline__item pk-timeline__item--${e.type}`}>
              <span className="pk-timeline__time">{e.at ? lagosShort(e.at) : '—'}</span>
              <span className="pk-timeline__what">
                <strong>{e.label}</strong>
                {e.amountKobo !== null ? ` · ${formatKobo(e.amountKobo)}` : ''}
                {e.detail ? (
                  <Text as="span" variant="body-sm" tone="secondary">
                    {' '}
                    · {e.detail}
                  </Text>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
