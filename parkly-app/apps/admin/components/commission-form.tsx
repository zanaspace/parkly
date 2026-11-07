'use client';

import { ActionForm, Button, Text } from '@parkly/ui';
import { useActionState } from 'react';
import { setCommission } from '../lib/kyb/actions';
import { COMMISSION_MAX_PERCENT, COMMISSION_MIN_PERCENT } from '../lib/kyb/commission';

/**
 * Finance or super admin changes an operator's commission (10–15%). Bookings
 * already made keep the rate they were made at; the reason goes to the audit log.
 */
export function CommissionForm({
  operatorId,
  currentBps,
}: {
  operatorId: string;
  currentBps: number;
}) {
  const [state, action, pending] = useActionState(setCommission, undefined);
  return (
    <section className="pk-card" aria-labelledby="commission-heading">
      <Text variant="label-lg" as="h2" id="commission-heading">
        Commission rate
      </Text>
      <Text variant="body-sm" tone="tertiary">
        Now {currentBps / 100}%. A new rate applies to bookings made from now on; bookings already
        made keep their rate. Parkly’s service fee is separate.
      </Text>
      <ActionForm action={action} className="pk-form">
        <input type="hidden" name="operatorId" value={operatorId} />
        <label className="pk-field__label" htmlFor="commission-percent">
          New rate (%)
        </label>
        <input
          id="commission-percent"
          name="percent"
          className="pk-input"
          type="number"
          inputMode="decimal"
          min={COMMISSION_MIN_PERCENT}
          max={COMMISSION_MAX_PERCENT}
          step="0.01"
          defaultValue={currentBps / 100}
          required
        />
        <label className="pk-field__label" htmlFor="commission-reason">
          Reason (kept in the audit log)
        </label>
        <textarea
          id="commission-reason"
          name="reason"
          className="pk-input"
          rows={2}
          minLength={5}
          maxLength={500}
          required
        />
        <Button type="submit" variant="secondary" loading={pending}>
          Change rate
        </Button>
      </ActionForm>
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
      {state?.saved !== undefined && (
        <p className="pk-notice pk-notice--info" role="status">
          Rate changed to {state.saved / 100}%. New bookings use it from now.
        </p>
      )}
    </section>
  );
}
