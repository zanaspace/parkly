'use client';

import { ActionForm, Button } from '@parkly/ui';
import { useActionState } from 'react';
import { decideRefundAction } from '../lib/bookings/actions';
import { ActionError } from './action-error';

/** Approve (issues the refund) or reject with a reason. The API refuses the person who asked. */
export function RefundDecision({
  requestId,
  idempotencyKey,
}: {
  requestId: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(decideRefundAction, undefined);
  if (state?.done)
    return (
      <p className="pk-notice pk-notice--info" role="status">
        {state.done}
      </p>
    );
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="pk-field">
        <span className="pk-field__label">Note (needed to reject)</span>
        <input
          className="pk-input"
          name="note"
          maxLength={500}
          placeholder="e.g. Checked on Paystack"
        />
      </label>
      <div className="pk-row">
        <Button type="submit" name="decision" value="approve" loading={pending}>
          Approve and refund
        </Button>
        <Button type="submit" name="decision" value="reject" variant="secondary" loading={pending}>
          Reject
        </Button>
      </div>
      {state?.error && <ActionError message={state.error} />}
    </ActionForm>
  );
}
