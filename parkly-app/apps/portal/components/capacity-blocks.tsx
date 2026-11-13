'use client';

import type { CapacityBlock, Lot } from '@parkly/contracts';
import { ActionForm, Button, Input, Text } from '@parkly/ui';
import { useActionState } from 'react';
import {
  createCapacityBlock,
  deleteCapacityBlock,
  setRequiresVerifiedDriver,
} from '../lib/lots/actions';

function fmtWindow(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  });
}

/** FR-LOT-008: Operator capacity blackouts (full or partial maintenance / event windows). */
export function CapacityBlocksSection(props: {
  operatorId: string;
  lot: Lot;
  blocks: CapacityBlock[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(createCapacityBlock, undefined);

  return (
    <section className="pk-card pk-stack">
      <Text tone="secondary">
        Schedule maintenance or event windows that temporarily block all or part of your spaces from
        new bookings. Existing confirmed bookings are always honoured; you cannot create a blackout
        that would reduce remaining capacity below already-confirmed bookings.
      </Text>

      {props.blocks.length > 0 ? (
        <div className="pk-stack" style={{ gap: '0.5rem' }}>
          {props.blocks.map((b) => (
            <div
              key={b.id}
              className="pk-row pk-row--between"
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--pk-color-border-subtle)',
                background: 'var(--pk-color-bg-subtle)',
              }}
            >
              <div>
                <Text variant="label-md">
                  {b.blockedBays >= props.lot.capacityBookable
                    ? 'Full lot blackout (all spaces)'
                    : `${b.blockedBays} of ${props.lot.capacityBookable} spaces blocked`}
                </Text>
                <Text variant="body-sm" tone="secondary">
                  {fmtWindow(b.startsAt)} – {fmtWindow(b.endsAt)}
                  {b.reason ? ` · ${b.reason}` : ''}
                </Text>
              </div>
              {props.canManage && (
                <ActionForm action={deleteCapacityBlock}>
                  <input type="hidden" name="operatorId" value={props.operatorId} />
                  <input type="hidden" name="lotId" value={props.lot.id} />
                  <input type="hidden" name="blockId" value={b.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </ActionForm>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Text variant="body-sm" tone="tertiary">
          No capacity blackouts scheduled.
        </Text>
      )}

      {props.canManage && (
        <ActionForm action={action} className="pk-stack">
          <input type="hidden" name="operatorId" value={props.operatorId} />
          <input type="hidden" name="lotId" value={props.lot.id} />
          <div className="pk-row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Input label="Starts at (Lagos time)" name="startsAt" type="datetime-local" required />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Input label="Ends at (Lagos time)" name="endsAt" type="datetime-local" required />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Input
                label={`Spaces to block (max ${props.lot.capacityBookable})`}
                name="blockedBays"
                type="number"
                min={1}
                max={props.lot.capacityBookable}
                placeholder="Blank = full lot"
              />
            </div>
          </div>
          <Input
            label="Reason (optional)"
            name="reason"
            placeholder="e.g. Resurfacing bays 1–10 or private event"
            maxLength={200}
          />
          <div>
            <Button type="submit" variant="secondary" loading={pending}>
              Add capacity blackout
            </Button>
          </div>
          {state?.error && (
            <p className="pk-notice pk-notice--error" role="alert">
              {state.error}
            </p>
          )}
          {state?.saved && (
            <p className="pk-notice pk-notice--info" role="status">
              Capacity blackout saved.
            </p>
          )}
        </ActionForm>
      )}
    </section>
  );
}

/** FR-PASS-005: Operator toggle requiring Verified Driver status (Tier 2 KYC) for bookings & passes. */
export function VerifiedDriverGateSection(props: {
  operatorId: string;
  lot: Lot;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(setRequiresVerifiedDriver, undefined);
  const enabled = Boolean(props.lot.requiresVerifiedDriver);

  return (
    <section className="pk-card pk-stack">
      <Text tone="secondary">
        {enabled
          ? 'Required: only drivers who have completed Parkly Verified Driver identity verification (FRSC Driver’s License or NIN) can book or buy a monthly pass at this car park.'
          : 'Optional: any registered driver can book hourly or daily stays. Monthly passes require Verified Driver status by default.'}
      </Text>
      {props.canManage ? (
        <ActionForm action={action}>
          <input type="hidden" name="operatorId" value={props.operatorId} />
          <input type="hidden" name="lotId" value={props.lot.id} />
          <input type="hidden" name="version" value={String(props.lot.version)} />
          <input
            type="hidden"
            name="requiresVerifiedDriver"
            value={enabled ? 'false' : 'true'}
          />
          <Button type="submit" variant={enabled ? 'secondary' : 'primary'} loading={pending}>
            {enabled
              ? 'Allow unverified drivers for hourly/daily stays'
              : 'Require Verified Driver for all bookings'}
          </Button>
          {state?.error && (
            <p className="pk-notice pk-notice--error" role="alert">
              {state.error}
            </p>
          )}
        </ActionForm>
      ) : (
        <Text variant="body-sm" tone="tertiary">
          Only the owner or manager can change this policy.
        </Text>
      )}
    </section>
  );
}
