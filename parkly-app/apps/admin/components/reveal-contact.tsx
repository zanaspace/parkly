'use client';

import { ActionForm, Button } from '@parkly/ui';
import { useActionState, useState } from 'react';
import { revealContact } from '../lib/bookings/actions';

/**
 * Shows a driver's full phone or email after support says why. The API logs
 * who saw it, when and the reason before it answers.
 */
export function RevealContact({
  bookingId,
  field,
  masked,
}: {
  bookingId: string;
  field: 'phone' | 'email';
  masked: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(revealContact, undefined);
  if (state?.field === field)
    return (
      <span className="pk-reveal">
        <strong>{state.value ?? 'Not on file'}</strong>{' '}
        <span className="pk-reveal__note">(shown to you and logged)</span>
      </span>
    );
  return (
    <span className="pk-reveal">
      <span>{masked}</span>{' '}
      {!open ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Reveal
        </Button>
      ) : (
        <ActionForm action={action} className="pk-form pk-reveal__form">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="field" value={field} />
          <label className="pk-field">
            <span className="pk-field__label">Why do you need the full {field}?</span>
            <input
              className="pk-input"
              name="reason"
              minLength={5}
              maxLength={200}
              required
              placeholder="e.g. Driver called: gate refused entry"
            />
          </label>
          <Button type="submit" size="sm" loading={pending}>
            Show {field}
          </Button>
          {state?.error && (
            <p className="pk-notice pk-notice--error" role="alert">
              {state.error}
            </p>
          )}
        </ActionForm>
      )}
    </span>
  );
}
