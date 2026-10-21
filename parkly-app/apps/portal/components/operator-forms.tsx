'use client';

import type { Operator } from '@parkly/contracts';
import { Button, Input, Select } from '@parkly/ui';
import { useActionState } from 'react';
import { signUp } from '../lib/auth/actions';
import { MIN_PASSWORD_LENGTH } from '../lib/auth/messages';
import { createOperator, updateOperator } from '../lib/operators/actions';
import { OPERATOR_TYPE_OPTIONS, type BusinessValues } from '../lib/operators/form';

function Notice({ tone, children }: { tone: 'error' | 'info'; children: string }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** O-01: email + password. Confirmation link lands on /onboarding. */
export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.message) return <Notice tone="info">{state.message}</Notice>;
  return (
    <form action={action} className="pk-form" noValidate>
      <Input label="Email address" name="email" type="email" autoComplete="email" required />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        helper={`At least ${MIN_PASSWORD_LENGTH} characters, with letters and numbers. Use a password manager.`}
        required
      />
      <Input
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Create account
      </Button>
    </form>
  );
}

const fromOperator = (op: Operator): BusinessValues => ({
  legalName: op.legalName,
  tradingName: op.tradingName,
  type: op.type,
  cacNumber: op.cacNumber ?? '',
  tin: op.tin ?? '',
  addressLine: op.addressLine ?? '',
  contactEmail: op.contactEmail ?? '',
  contactPhone: op.contactPhone ?? '',
});

/**
 * O-03 business details. `create` adds the Operator Agreement acceptance and
 * makes the user the owner; `edit` updates an existing operator.
 */
export function BusinessForm(
  props:
    | { mode: 'create'; agreementVersion: string }
    | { mode: 'edit'; operator: Operator; readOnly: boolean },
) {
  const [state, action, pending] = useActionState(
    props.mode === 'create' ? createOperator : updateOperator,
    undefined,
  );
  const initial = props.mode === 'edit' ? fromOperator(props.operator) : {};
  const v = { ...initial, ...state?.values };
  const err = state?.fieldErrors ?? {};
  const readOnly = props.mode === 'edit' && props.readOnly;
  // Re-mount fields after a save so they show the saved values.
  const key = state?.saved ? 'saved' : 'form';

  return (
    <form action={action} className="pk-form" noValidate key={key}>
      {props.mode === 'edit' && <input type="hidden" name="operatorId" value={props.operator.id} />}
      <Input
        label="Registered business name"
        name="legalName"
        defaultValue={v.legalName}
        helper="Exactly as on your CAC certificate."
        error={err.legalName}
        readOnly={readOnly}
        required
      />
      <Input
        label="Trading name"
        name="tradingName"
        defaultValue={v.tradingName}
        helper="The name drivers see in the app."
        error={err.tradingName}
        readOnly={readOnly}
        required
      />
      <Select
        label="Business type"
        name="type"
        defaultValue={v.type ?? ''}
        placeholder="Choose one"
        options={OPERATOR_TYPE_OPTIONS}
        error={err.type}
        disabled={readOnly}
        required
      />
      <Input
        label="CAC registration number"
        name="cacNumber"
        defaultValue={v.cacNumber}
        placeholder="RC 123456"
        error={err.cacNumber}
        readOnly={readOnly}
        required
      />
      <Input
        label="Tax ID (TIN), optional"
        name="tin"
        defaultValue={v.tin}
        placeholder="12345678-0001"
        error={err.tin}
        readOnly={readOnly}
      />
      <Input
        label="Business address"
        name="addressLine"
        defaultValue={v.addressLine}
        autoComplete="street-address"
        error={err.addressLine}
        readOnly={readOnly}
        required
      />
      <Input
        label="Contact email"
        name="contactEmail"
        type="email"
        defaultValue={v.contactEmail}
        autoComplete="email"
        error={err.contactEmail}
        readOnly={readOnly}
        required
      />
      <Input
        label="Contact phone"
        name="contactPhone"
        type="tel"
        defaultValue={v.contactPhone}
        placeholder="0803 123 4567"
        autoComplete="tel"
        error={err.contactPhone}
        readOnly={readOnly}
        required
      />

      {props.mode === 'create' && (
        <>
          <input type="hidden" name="agreementVersion" value={props.agreementVersion} />
          <label className="pk-check">
            <input type="checkbox" name="acceptAgreement" required />
            <span>
              I accept the Parkly Operator Agreement and Privacy Notice (version{' '}
              {props.agreementVersion}) on behalf of this business.
            </span>
          </label>
        </>
      )}

      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.saved && <Notice tone="info">Business details saved.</Notice>}
      {!readOnly && (
        <Button type="submit" loading={pending} fullWidth>
          {props.mode === 'create' ? 'Create operator account' : 'Save changes'}
        </Button>
      )}
    </form>
  );
}
