'use client';

import { ActionForm, Button } from '@parkly/ui';
import { useActionState } from 'react';
import { cancelUpcomingBookings } from '../lib/lots/actions';
import { ActionError } from './action-error';

/** Cancel every paid, not-yet-started booking at a suspended car park, refunding in full. */
export function CancelUpcomingForm({ lotId, count }: { lotId: string; count: number }) {
  const [state, action, pending] = useActionState(cancelUpcomingBookings, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="lotId" value={lotId} />
      <label className="pk-field">
        <span className="pk-field__label">Reason (kept in the audit log)</span>
        <input className="pk-input" name="reason" minLength={5} maxLength={500} required />
      </label>
      <Button type="submit" variant="secondary" loading={pending} disabled={count === 0}>
        Cancel {count} booking{count === 1 ? '' : 's'} and refund in full
      </Button>
      {state?.error && <ActionError message={state.error} />}
      {state?.done && (
        <p className="pk-notice pk-notice--info" role="status">
          {state.done}
        </p>
      )}
    </ActionForm>
  );
}
