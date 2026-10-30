'use client';

import { ActionForm, Button } from '@parkly/ui';
import { useActionState } from 'react';
import { waiveOverstay } from '../lib/bookings/actions';

/** Ops goodwill (e.g. the barrier was broken): the reason goes into the audit log. */
export function WaiveOverstayForm({ bookingId, amount }: { bookingId: string; amount: string }) {
  const [state, action, pending] = useActionState(waiveOverstay, undefined);
  if (state?.done)
    return (
      <p className="pk-notice pk-notice--info" role="status">
        Overstay waived. The driver can book again.
      </p>
    );
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="pk-field">
        <span className="pk-field__label">Why are you waiving {amount}?</span>
        <textarea
          className="pk-input"
          name="reason"
          rows={3}
          maxLength={500}
          required
          placeholder="e.g. Exit barrier was broken; the driver couldn’t leave on time."
        />
      </label>
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" loading={pending}>
        Waive overstay
      </Button>
    </ActionForm>
  );
}
