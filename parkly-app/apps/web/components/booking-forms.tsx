'use client';

import type { Vehicle } from '@parkly/contracts';
import { Button, Input, ActionForm } from '@parkly/ui';
import { useActionState } from 'react';
import { addCar, startBooking, type BookState } from '../lib/booking-actions';

type Window = { lotId: string; product: string; startAt: string; endAt: string };

/** D-14/D-15: pick the car and pay. Hidden fields carry the server-checked window. */
export function PayForm({
  window,
  vehicles,
  idempotencyKey,
  back,
  totalLabel,
}: {
  window: Window;
  vehicles: Vehicle[];
  idempotencyKey: string;
  back: string;
  totalLabel: string;
}) {
  const [state, action, pending] = useActionState<BookState, FormData>(startBooking, undefined);
  const preferred = vehicles.find((v) => v.isDefault) ?? vehicles[0];
  return (
    <ActionForm action={action} className="pk-stack">
      {Object.entries(window).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="key" value={idempotencyKey} />
      <input type="hidden" name="back" value={back} />
      <fieldset className="pk-stack">
        <legend className="pk-field__label">Car</legend>
        {vehicles.map((v) => (
          <label key={v.id} className="pk-check">
            <input
              type="radio"
              name="vehicleId"
              value={v.id}
              defaultChecked={v.id === preferred?.id}
              required
            />{' '}
            <code>{v.plateNorm}</code>
            {v.make ? ` · ${v.make}` : ''}
          </label>
        ))}
      </fieldset>
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? 'Opening Paystack…' : `Pay ${totalLabel}`}
      </Button>
    </ActionForm>
  );
}

export function AddCarForm({ back }: { back: string }) {
  const [state, action, pending] = useActionState<BookState, FormData>(addCar, undefined);
  return (
    <ActionForm action={action} className="pk-stack">
      <input type="hidden" name="back" value={back} />
      <Input
        label="Plate number"
        name="plate"
        placeholder="LND 123 AB"
        autoCapitalize="characters"
        required
        helper="Attendants check this at the gate."
      />
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? 'Saving…' : 'Add car'}
      </Button>
    </ActionForm>
  );
}
