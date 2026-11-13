'use client';

import type { Pass, Vehicle } from '@parkly/contracts';
import { ActionForm, Button, Input, Text } from '@parkly/ui';
import { useActionState, useState } from 'react';
import {
  joinPassWaitlist,
  renewPass,
  startPass,
  swapPassVehicle,
  verifyDriverIdentity,
  type BookState,
} from '../lib/booking-actions';

/**
 * FR-AUTH-009 & FR-PASS-005: 60-second Driver Identity Verification (Tier 2 KYC)
 * via Nigerian FRSC Driver's License + DOB or 11-digit NIN.
 */
export function DriverVerificationCard({
  isVerified,
  verifiedAt,
  idNumberMasked,
  back,
  requiredForLot,
}: {
  isVerified: boolean;
  verifiedAt?: string | null;
  idNumberMasked?: string | null;
  back: string;
  requiredForLot?: boolean;
}) {
  const [method, setMethod] = useState<'DRIVERS_LICENSE' | 'NIN'>('DRIVERS_LICENSE');
  const [state, action, pending] = useActionState<BookState, FormData>(
    verifyDriverIdentity,
    undefined,
  );

  if (isVerified) {
    return (
      <section className="pk-card pk-verified" aria-label="Verified Driver status">
        <div className="pk-row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <span className="pk-badge pk-badge--verified">✓ Verified Driver</span>
          {idNumberMasked && (
            <Text variant="body-sm" tone="secondary">
              ID {idNumberMasked}
            </Text>
          )}
        </div>
        <Text variant="body-sm" tone="secondary">
          Your Nigerian identity is verified for monthly passes and verified-only car parks
          {verifiedAt ? ` (since ${verifiedAt.slice(0, 10)})` : ''}.
        </Text>
      </section>
    );
  }

  return (
    <section className="pk-card pk-stack" aria-label="Verify your driver identity">
      <div className="pk-row" style={{ gap: '0.5rem', alignItems: 'center' }}>
        <span className="pk-badge pk-badge--pending">60-Second Verification</span>
        {requiredForLot && (
          <span className="pk-badge pk-badge--brand-subtle">Required for this lot</span>
        )}
      </div>
      <Text variant="heading-md" as="h2">
        Get your Verified Driver badge
      </Text>
      <Text variant="body-sm" tone="secondary">
        Verify once with your FRSC Driver’s License or NIN to unlock monthly passes and gated
        corporate car parks. Your ID number is encrypted at rest and never shared.
      </Text>

      <ActionForm action={action} className="pk-stack">
        <input type="hidden" name="back" value={back} />
        <fieldset className="pk-stack">
          <legend className="pk-field__label">Verification method</legend>
          <label className="pk-check">
            <input
              type="radio"
              name="method"
              value="DRIVERS_LICENSE"
              checked={method === 'DRIVERS_LICENSE'}
              onChange={() => setMethod('DRIVERS_LICENSE')}
            />{' '}
            FRSC Driver’s License (recommended)
          </label>
          <label className="pk-check">
            <input
              type="radio"
              name="method"
              value="NIN"
              checked={method === 'NIN'}
              onChange={() => setMethod('NIN')}
            />{' '}
            National Identity Number (11-digit NIN)
          </label>
        </fieldset>

        <Input
          label={
            method === 'DRIVERS_LICENSE'
              ? 'Driver’s License Number'
              : '11-Digit National Identity Number (NIN)'
          }
          name="idNumber"
          placeholder={method === 'DRIVERS_LICENSE' ? 'ABC12345AA12' : '12345678901'}
          autoCapitalize="characters"
          required
        />

        {method === 'DRIVERS_LICENSE' && (
          <Input
            label="Date of birth"
            name="dateOfBirth"
            type="date"
            required
            helper="Must match your FRSC Driver’s License record."
          />
        )}

        {state?.error && (
          <p className="pk-notice pk-notice--error" role="alert">
            {state.error}
          </p>
        )}

        <Button type="submit" fullWidth disabled={pending}>
          {pending ? 'Verifying identity…' : 'Verify & Unlock Badge'}
        </Button>
      </ActionForm>
    </section>
  );
}

/** FR-PASS-001: Purchase a 30-day monthly pass or join the waitlist if full. */
export function BuyPassForm({
  lotId,
  lotName,
  monthlyRateLabel,
  vehicles,
  defaultStartDate,
  idempotencyKey,
  back,
}: {
  lotId: string;
  lotName: string;
  monthlyRateLabel: string;
  vehicles: Vehicle[];
  defaultStartDate: string;
  idempotencyKey: string;
  back: string;
}) {
  const [state, action, pending] = useActionState<BookState, FormData>(startPass, undefined);
  const [waitState, waitAction, waitPending] = useActionState<BookState, FormData>(
    joinPassWaitlist,
    undefined,
  );
  const preferred = vehicles.find((v) => v.isDefault) ?? vehicles[0];

  return (
    <section className="pk-card pk-stack" aria-label="Purchase monthly pass">
      <Text variant="heading-md" as="h2">
        Buy 30-Day Monthly Pass · {lotName}
      </Text>
      <Text tone="secondary">
        {monthlyRateLabel} for 30 consecutive days · 1 vehicle parked in the lot at a time · Up to 2
        vehicle swaps per month.
      </Text>

      <ActionForm action={action} className="pk-stack">
        <input type="hidden" name="lotId" value={lotId} />
        <input type="hidden" name="key" value={idempotencyKey} />
        <input type="hidden" name="back" value={back} />

        <Input
          label="Start date"
          name="startDate"
          type="date"
          defaultValue={defaultStartDate}
          required
        />

        <fieldset className="pk-stack">
          <legend className="pk-field__label">Primary car</legend>
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
          {pending ? 'Opening checkout…' : `Pay ${monthlyRateLabel} for 30-Day Pass`}
        </Button>
      </ActionForm>

      <details className="pk-stack">
        <summary className="pk-link">Pass capacity full? Join the monthly waitlist</summary>
        <ActionForm action={waitAction} className="pk-stack">
          <input type="hidden" name="lotId" value={lotId} />
          <input type="hidden" name="back" value={back} />
          <Input
            label="Desired start date"
            name="desiredStart"
            type="date"
            defaultValue={defaultStartDate}
            required
          />
          {waitState?.error && (
            <p className="pk-notice pk-notice--error" role="alert">
              {waitState.error}
            </p>
          )}
          <Button type="submit" variant="secondary" fullWidth disabled={waitPending}>
            {waitPending ? 'Joining waitlist…' : 'Join Waitlist'}
          </Button>
        </ActionForm>
      </details>
    </section>
  );
}

/** FR-PASS-003 (One-tap renew) & FR-PASS-004 (Vehicle swap up to 2 times/month). */
export function PassManageActions({ pass, vehicles }: { pass: Pass; vehicles: Vehicle[] }) {
  const [swapState, swapAction, swapPending] = useActionState<BookState, FormData>(
    swapPassVehicle,
    undefined,
  );
  const [renewState, renewAction, renewPending] = useActionState<BookState, FormData>(
    renewPass,
    undefined,
  );
  const otherVehicles = vehicles.filter((v) => v.id !== pass.vehicle.id);

  return (
    <div className="pk-stack">
      {pass.status === 'ACTIVE' && (
        <section className="pk-card pk-stack" aria-label="Swap pass vehicle">
          <div className="pk-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="heading-md" as="h3">
              Swap Vehicle (FR-PASS-004)
            </Text>
            <span className="pk-badge pk-badge--brand-subtle">
              {pass.swapsRemaining} of 2 swaps left this month
            </span>
          </div>
          <Text variant="body-sm" tone="secondary">
            Need to bring a different car today? You can swap the active plate on your monthly pass
            up to 2 times per pass period. Only 1 vehicle can be inside the car park at a time.
          </Text>
          {pass.swapsRemaining <= 0 ? (
            <p className="pk-notice" role="status">
              You have used all 2 vehicle swaps for this pass period.
            </p>
          ) : otherVehicles.length === 0 ? (
            <Text variant="body-sm" tone="tertiary">
              Add another car to your account to swap vehicles on this pass.
            </Text>
          ) : (
            <ActionForm action={swapAction} className="pk-stack">
              <input type="hidden" name="passId" value={pass.id} />
              <fieldset className="pk-stack">
                <legend className="pk-field__label">Switch pass to</legend>
                {otherVehicles.map((v, idx) => (
                  <label key={v.id} className="pk-check">
                    <input
                      type="radio"
                      name="vehicleId"
                      value={v.id}
                      defaultChecked={idx === 0}
                      required
                    />{' '}
                    <code>{v.plateNorm}</code>
                    {v.make ? ` · ${v.make}` : ''}
                  </label>
                ))}
              </fieldset>
              {swapState?.error && (
                <p className="pk-notice pk-notice--error" role="alert">
                  {swapState.error}
                </p>
              )}
              <Button type="submit" variant="secondary" fullWidth disabled={swapPending}>
                {swapPending ? 'Swapping plate…' : 'Swap Vehicle Plate'}
              </Button>
            </ActionForm>
          )}
        </section>
      )}

      {(pass.status === 'ACTIVE' || pass.status === 'EXPIRED') && (
        <section className="pk-card pk-stack" aria-label="One-tap pass renewal">
          <Text variant="heading-md" as="h3">
            One-Tap Renewal (FR-PASS-003)
          </Text>
          <Text variant="body-sm" tone="secondary">
            Renew this pass for the next 30-day window starting immediately after {pass.periodEnd}.
          </Text>
          <ActionForm action={renewAction} className="pk-stack">
            <input type="hidden" name="passId" value={pass.id} />
            {renewState?.error && (
              <p className="pk-notice pk-notice--error" role="alert">
                {renewState.error}
              </p>
            )}
            <Button type="submit" fullWidth disabled={renewPending}>
              {renewPending ? 'Preparing renewal…' : 'One-Tap Renew for 30 Days'}
            </Button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
