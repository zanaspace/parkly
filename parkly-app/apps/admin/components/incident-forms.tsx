'use client';

import { ActionForm, Button, Select } from '@parkly/ui';
import { useActionState } from 'react';
import {
  addIncidentNoteAction,
  createIncidentAction,
  incidentStepAction,
} from '../lib/incidents/actions';
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS } from '../lib/incidents/copy';

/** FR-INC-001: log an incident against a car park, optionally about one booking. */
export function NewIncidentForm({
  lots,
  defaultLotId,
  bookingId,
}: {
  lots: { id: string; name: string; operatorName: string }[];
  defaultLotId?: string;
  bookingId?: string;
}) {
  const [state, action, pending] = useActionState(createIncidentAction, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <Select
        label="Car park"
        name="lotId"
        placeholder="Choose a car park"
        defaultValue={defaultLotId ?? ''}
        options={lots.map((l) => ({ value: l.id, label: `${l.name} · ${l.operatorName}` }))}
        required
      />
      {bookingId && (
        <>
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="pk-notice pk-notice--info">
            This incident will be linked to the booking you came from.
          </p>
        </>
      )}
      <Select
        label="What kind"
        name="category"
        defaultValue="ACCESS_DENIED"
        options={CATEGORY_OPTIONS}
      />
      <Select
        label="How serious"
        name="severity"
        defaultValue="MEDIUM"
        options={SEVERITY_OPTIONS}
      />
      <label className="pk-field">
        <span className="pk-field__label">What happened</span>
        <textarea
          className="pk-input"
          name="description"
          rows={4}
          minLength={10}
          maxLength={2000}
          required
          placeholder="e.g. Attendant at the gate says the driver isn’t booked; the code on the ticket is valid."
        />
      </label>
      <Button type="submit" loading={pending}>
        Log incident
      </Button>
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
    </ActionForm>
  );
}

const STEP_LABEL = {
  TRIAGE: 'Take it (triage)',
  RESOLVE: 'Mark resolved',
  CLOSE: 'Close',
  REOPEN: 'Reopen',
} as const;

/** The next step for the incident. Resolving and reopening ask for words, which are audited. */
export function IncidentSteps({
  incidentId,
  steps,
}: {
  incidentId: string;
  steps: (keyof typeof STEP_LABEL)[];
}) {
  const [state, action, pending] = useActionState(incidentStepAction, undefined);
  if (steps.length === 0) return null;
  const needsText = steps.includes('RESOLVE') || steps.includes('REOPEN');
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="incidentId" value={incidentId} />
      {needsText && (
        <label className="pk-field">
          <span className="pk-field__label">
            {steps.includes('RESOLVE') ? 'How it was resolved' : 'Why reopen (needed to reopen)'}
          </span>
          <input className="pk-input" name="text" maxLength={1000} />
        </label>
      )}
      <div className="pk-row">
        {steps.map((s, i) => (
          <Button
            key={s}
            type="submit"
            name="action"
            value={s}
            variant={i === 0 ? 'primary' : 'secondary'}
            loading={pending}
          >
            {STEP_LABEL[s]}
          </Button>
        ))}
      </div>
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
      {state?.done && (
        <p className="pk-notice pk-notice--info" role="status">
          {state.done}
        </p>
      )}
    </ActionForm>
  );
}

export function IncidentNoteForm({ incidentId }: { incidentId: string }) {
  const [state, action, pending] = useActionState(addIncidentNoteAction, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="incidentId" value={incidentId} />
      <label className="pk-field">
        <span className="pk-field__label">Add a note</span>
        <textarea className="pk-input" name="body" rows={2} maxLength={2000} required />
      </label>
      <Button type="submit" variant="secondary" loading={pending}>
        Add note
      </Button>
      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {state.error}
        </p>
      )}
    </ActionForm>
  );
}
