import type { VerifyPaymentResponse } from '@parkly/contracts';
import { checkoutState } from '@parkly/domain/booking';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiAs } from '../../../lib/api';
import { requireDriver } from '../../../lib/session';

export const metadata: Metadata = { title: 'Payment · Parkly' };

const REFERENCE = /^[0-9a-f-]{36}$/;

const MESSAGE = {
  failed: 'The payment didn’t go through and your space was released. Nothing was charged.',
  expired: 'The 10 minutes to pay ran out, so the space was released.',
  refunding:
    'Your payment arrived after the space was released, so we’re refunding it in full. It can take a few days to reach you.',
} as const;

/**
 * Paystack sends the driver here (`?reference=`). The server asks Paystack;
 * only its answer confirms the booking (doc 00 §3.10 rule 7). While Paystack
 * is still settling, the page checks again every 3 seconds.
 */
export default async function Paid({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const reference = String(q.reference ?? q.trxref ?? '');
  const driver = await requireDriver(`/bookings/paid?reference=${encodeURIComponent(reference)}`);
  if (!REFERENCE.test(reference)) redirect('/bookings');

  // A failed check (network, Paystack slow) only means "still waiting": the page retries.
  const result = await apiAs<VerifyPaymentResponse>(
    driver.accessToken,
    `/v1/payments/${reference}/verify`,
    { method: 'POST' },
  ).catch(() => null);
  const state = result
    ? checkoutState({ booking: result.booking.status, payment: result.payment.status })
    : 'waiting';
  if (state === 'paid') redirect(result ? `/bookings/${result.booking.id}` : '/bookings');

  return (
    <main className="pk-page pk-stack">
      <Text variant="heading-xl" as="h1">
        {state === 'waiting' ? 'Confirming your payment…' : 'Payment'}
      </Text>
      {state === 'waiting' ? (
        <>
          <meta httpEquiv="refresh" content="3" />
          <p className="pk-notice pk-notice--info" role="status">
            We’re checking with Paystack. This page updates by itself.
          </p>
        </>
      ) : (
        <p className="pk-notice pk-notice--error" role="alert">
          {MESSAGE[state]}
        </p>
      )}
      <Link className="pk-link" href="/bookings">
        My bookings
      </Link>
    </main>
  );
}
