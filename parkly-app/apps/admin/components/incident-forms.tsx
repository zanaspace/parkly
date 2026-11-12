'use client';

import { ActionForm, Button } from '@parkly/ui';
import { useActionState } from 'react';
import {
  addIncidentNoteAction,
  createIncidentAction,
  incidentStepAction,
} from '../lib/incidents/actions';
import { CATEGORY, SEVERITY_OPTIONS } from '../lib/incidents/copy';

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
      <label className="pk-field">
        <span className="pk-field__label">Car park</span>
        <select className="pk-input" name="lotId" defaultValue={defaultLotId ?? ''} required>
          <option value="" disabled>
            Choose a car park
          </option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.operatorName}
            </option>
          ))}
        </select>
      </label>
      {bookingId && (
        <>
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="pk-notice pk-notice--info">
            This incident will be linked to the booking you came from.
          </p>
        </>
      )}
      <label className="pk-field">
        <span className="pk-field__label">What kind</span>
        <select className="pk-input" name="category" defaultValue="ACCESS_DENIED">
          {Object.entries(CATEGORY).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="pk-field">
        <span className="pk-field__label">How serious</span>
        <select className="pk-input" name="severity" defaultValue="MEDIUM">
          {SEVERITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
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
