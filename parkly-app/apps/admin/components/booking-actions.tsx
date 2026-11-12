'use client';

import { ActionForm, Button, Select, Text } from '@parkly/ui';
import { useActionState } from 'react';
import {
  type ActionState,
  cancelBookingAction,
  refundBookingAction,
  resendTicketAction,
} from '../lib/bookings/actions';

const REFUND_REASONS = [
  { value: 'OPS_GOODWILL', label: 'Goodwill' },
  { value: 'LOT_UNAVAILABLE', label: 'Car park couldn’t take the car' },
  { value: 'DUPLICATE', label: 'Charged twice' },
  { value: 'OTHER', label: 'Other' },
];

function Outcome({ state }: { state: ActionState }) {
  if (state?.error)
    return (
      <p className="pk-notice pk-notice--error" role="alert">
        {state.error}
      </p>
    );
  if (state?.done)
    return (
      <p className="pk-notice pk-notice--info" role="status">
        {state.done}
      </p>
    );
  return null;
}

/** Same policy as the driver's own cancel; a bigger refund is a separate refund. */
export function CancelBookingForm({
  bookingId,
  idempotencyKey,
}: {
  bookingId: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(cancelBookingAction, undefined);
  if (state?.done) return <Outcome state={state} />;
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="bookingId" value={bookingId} />
      {/* Fixed when the page loads, so a double click cancels once. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="pk-field">
        <span className="pk-field__label">Why are you cancelling?</span>
        <textarea
          className="pk-input"
          name="reason"
          rows={2}
          minLength={5}
          maxLength={500}
          required
          placeholder="e.g. Driver called: travel plans changed"
        />
      </label>
      <Text variant="body-sm" tone="tertiary">
        The refund follows the cancellation policy, as if the driver cancelled. To give more back,
        ask finance for a refund.
      </Text>
      <Button type="submit" variant="secondary" loading={pending}>
        Cancel booking
      </Button>
      <Outcome state={state} />
    </ActionForm>
  );
}

/** An amount staff choose up to what's left; over the limit it waits for approval. */
export function RefundForm({
  bookingId,
  idempotencyKey,
  refundable,
  threshold,
  helperText,
}: {
  bookingId: string;
  idempotencyKey: string;
  refundable: string;
  threshold: string;
  helperText?: string;
}) {
  const [state, action, pending] = useActionState(refundBookingAction, undefined);
  if (state?.done) return <Outcome state={state} />;
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="pk-field">
        <span className="pk-field__label">Amount (₦), up to {refundable}</span>
        <input className="pk-input" name="amount" inputMode="decimal" required placeholder="1500" />
      </label>
      <Select label="Reason" name="reason" defaultValue="OPS_GOODWILL" options={REFUND_REASONS} />
      <label className="pk-field">
        <span className="pk-field__label">What happened (kept in the audit log)</span>
        <textarea
          className="pk-input"
          name="note"
          rows={2}
          minLength={5}
          maxLength={500}
          required
          placeholder="e.g. Exit barrier stuck for 40 minutes"
        />
      </label>
      <Text variant="body-sm" tone="tertiary">
        {helperText ?? `Refunds over ${threshold} need a second finance admin to approve them.`}
      </Text>
      <Button type="submit" variant="secondary" loading={pending}>
        Refund
      </Button>
      <Outcome state={state} />
    </ActionForm>
  );
}

export function ResendTicketButton({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(resendTicketAction, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="ghost" loading={pending}>
        Resend ticket
      </Button>
      <Outcome state={state} />
    </ActionForm>
  );
}
