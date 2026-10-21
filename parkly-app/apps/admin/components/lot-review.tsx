'use client';

import { Button, Input, Text } from '@parkly/ui';
import { useActionState, useState } from 'react';
import {
  changeLotStatus,
  permitDocumentLink,
  recordVisit,
  reviewPermit,
  reviewPhoto,
  reviewRatePlan,
  reviewVisit,
  type ActionState,
} from '../lib/lots/actions';
import { CHECKLIST } from '../lib/lots/copy';

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Result({ state }: { state: ActionState }) {
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

function Hidden({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

/** Opens the permit scan in a new tab through a 5-minute link (audited by the API). */
export function OpenPermitButton({ permitId }: { permitId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function open() {
    setError(null);
    setBusy(true);
    // Open the tab inside the click so pop-up blockers allow it, then point it at the link.
    const tab = window.open('', '_blank');
    const res = await permitDocumentLink(permitId);
    setBusy(false);
    if (!res.ok) {
      tab?.close();
      return setError(res.error);
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = res.url;
    } else window.location.assign(res.url);
  }
  return (
    <>
      <Button type="button" variant="ghost" size="sm" loading={busy} onClick={open}>
        Open permit scan
      </Button>
      {error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * Approve, or reject with a reason. `approveExtra` adds fields to the approve
 * form (the LASPA check note for permits).
 */
function Decision(props: {
  action: Action;
  fields: Record<string, string>;
  approveLabel: string;
  rejectLabel: string;
  idPrefix: string;
  approveExtra?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(props.action, undefined);
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="pk-form">
      <form action={action} className="pk-form">
        <Hidden fields={{ ...props.fields, decision: 'APPROVE' }} />
        {props.approveExtra}
        {!rejecting && (
          <div className="pk-row">
            <Button type="submit" size="sm" loading={pending}>
              {props.approveLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(true)}>
              {props.rejectLabel}…
            </Button>
          </div>
        )}
      </form>
      {rejecting && (
        <form action={action} className="pk-form">
          <Hidden fields={{ ...props.fields, decision: 'REJECT' }} />
          <label className="pk-field__label" htmlFor={`${props.idPrefix}-reason`}>
            Reason (the operator sees this)
          </label>
          <textarea
            id={`${props.idPrefix}-reason`}
            name="reason"
            className="pk-input"
            rows={2}
            minLength={5}
            maxLength={500}
            required
          />
          <div className="pk-row">
            <Button type="submit" variant="secondary" size="sm" loading={pending}>
              {props.rejectLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <Result state={state} />
    </div>
  );
}

export function PermitDecision({ lotId, permitId }: { lotId: string; permitId: string }) {
  return (
    <Decision
      action={reviewPermit}
      fields={{ lotId, permitId }}
      idPrefix={`permit-${permitId}`}
      approveLabel="Approve permit"
      rejectLabel="Reject permit"
      approveExtra={
        <>
          <label className="pk-field__label" htmlFor={`permit-${permitId}-note`}>
            How LASPA confirmed it (phone, email or portal) and the reference
          </label>
          <textarea
            id={`permit-${permitId}-note`}
            name="note"
            className="pk-input"
            rows={2}
            maxLength={500}
          />
        </>
      }
    />
  );
}

export function PriceDecision({ lotId, ratePlanId }: { lotId: string; ratePlanId: string }) {
  return (
    <Decision
      action={reviewRatePlan}
      fields={{ lotId, ratePlanId }}
      idPrefix={`price-${ratePlanId}`}
      approveLabel="Approve price"
      rejectLabel="Reject price"
    />
  );
}

export function PhotoDecision({ lotId, photoId }: { lotId: string; photoId: string }) {
  return (
    <Decision
      action={reviewPhoto}
      fields={{ lotId, photoId }}
      idPrefix={`photo-${photoId}`}
      approveLabel="Approve"
      rejectLabel="Reject"
    />
  );
}

export function VisitDecision({
  lotId,
  verificationId,
}: {
  lotId: string;
  verificationId: string;
}) {
  return (
    <Decision
      action={reviewVisit}
      fields={{ lotId, verificationId }}
      idPrefix={`visit-${verificationId}`}
      approveLabel="Approve visit"
      rejectLabel="Reject visit"
    />
  );
}

/** X-03 on-site checklist. Works on a phone: GPS from the device, Lagos time. */
export function VisitForm({ lotId, capacityTotal }: { lotId: string; capacityTotal: number }) {
  const [state, action, pending] = useActionState(recordVisit, undefined);
  const [gps, setGps] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
  const [gpsError, setGpsError] = useState<string | null>(null);
  function locate() {
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }),
      () => setGpsError('Location isn’t available. You can type it in or leave it empty.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }
  return (
    <form action={action} className="pk-form">
      <Hidden fields={{ lotId }} />
      <Input
        label="Visit date and time (Lagos)"
        name="inspectedAt"
        type="datetime-local"
        required
      />
      <Input
        label={`Spaces counted on site (operator says ${capacityTotal})`}
        name="capacityCounted"
        type="number"
        inputMode="numeric"
        min={1}
        required
        helper="If you count fewer, the lot’s capacity is lowered to your count when the visit is approved."
      />
      <div className="pk-table-wrap">
        <table className="pk-table">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Pass</th>
              <th scope="col">Fail</th>
              <th scope="col">N/A</th>
              <th scope="col">Comment</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLIST.map(({ item, label, required }) => (
              <tr key={item}>
                <th scope="row">
                  {label}
                  {required && ' (required)'}
                </th>
                {(['PASS', 'FAIL', 'NA'] as const).map((r) => (
                  <td key={r}>
                    <input
                      type="radio"
                      name={`result:${item}`}
                      value={r}
                      aria-label={`${label}: ${r === 'NA' ? 'not applicable' : r.toLowerCase()}`}
                    />
                  </td>
                ))}
                <td>
                  <input
                    className="pk-input"
                    name={`comment:${item}`}
                    maxLength={300}
                    aria-label={`${label}: comment`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pk-row">
        <Input
          label="Latitude"
          name="lat"
          inputMode="decimal"
          value={gps.lat}
          onChange={(e) => setGps({ ...gps, lat: e.target.value })}
        />
        <Input
          label="Longitude"
          name="lng"
          inputMode="decimal"
          value={gps.lng}
          onChange={(e) => setGps({ ...gps, lng: e.target.value })}
        />
        <Button type="button" variant="ghost" size="sm" onClick={locate}>
          Use my location
        </Button>
      </div>
      {gpsError && <Text tone="secondary">{gpsError}</Text>}
      <label className="pk-field__label" htmlFor="visit-notes">
        Notes
      </label>
      <textarea id="visit-notes" name="notes" className="pk-input" rows={3} maxLength={1000} />
      <Button type="submit" loading={pending}>
        Record visit
      </Button>
      <Result state={state} />
    </form>
  );
}

/** One admin status move; `needsReason` shows a reason box the operator will see. */
export function StatusAction(props: {
  lotId: string;
  status: 'LIVE' | 'DRAFT' | 'SUSPENDED' | 'ARCHIVED';
  label: string;
  needsReason: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const [state, action, pending] = useActionState(changeLotStatus, undefined);
  const id = `status-${props.status}`;
  return (
    <form action={action} className="pk-form">
      <Hidden
        fields={{
          lotId: props.lotId,
          status: props.status,
          needsReason: props.needsReason ? 'yes' : 'no',
        }}
      />
      {props.needsReason && (
        <>
          <label className="pk-field__label" htmlFor={`${id}-reason`}>
            Reason (the operator sees this)
          </label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            className="pk-input"
            rows={2}
            minLength={5}
            maxLength={500}
            required
          />
        </>
      )}
      <Button
        type="submit"
        variant={props.variant ?? 'secondary'}
        loading={pending}
        disabled={props.disabled}
      >
        {props.label}
      </Button>
      <Result state={state} />
    </form>
  );
}
