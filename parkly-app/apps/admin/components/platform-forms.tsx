'use client';

import type { FeatureFlagItem, SettingItem } from '@parkly/contracts';
import { ActionForm, Button, Select } from '@parkly/ui';
import { useActionState } from 'react';
import { saveSettingAction, setFlagAction } from '../lib/platform/actions';
import { settingLimits } from '../lib/platform/copy';
import { ActionError } from './action-error';

const ON_OFF = [
  { value: 'true', label: 'On' },
  { value: 'false', label: 'Off' },
];

function Result({ state }: { state: { error?: string; done?: string } | undefined }) {
  if (state?.error) return <ActionError message={state.error} />;
  if (state?.done)
    return (
      <p className="pk-notice pk-notice--info" role="status">
        {state.done}
      </p>
    );
  return null;
}

/** One setting: a new value and a reason, which go to the audit log with the old value. */
export function SettingForm({ item }: { item: SettingItem }) {
  const [state, action, pending] = useActionState(saveSettingAction, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="key" value={item.key} />
      <input type="hidden" name="kind" value={item.kind} />
      {item.kind === 'boolean' ? (
        <Select label="New value" name="value" defaultValue={String(item.value)} options={ON_OFF} />
      ) : (
        <label className="pk-field">
          <span className="pk-field__label">New value{item.unit ? ` (${item.unit})` : ''}</span>
          <input
            className="pk-input"
            name="value"
            type="number"
            inputMode="numeric"
            step={1}
            min={item.min ?? undefined}
            max={item.max ?? undefined}
            defaultValue={Number(item.value)}
            required
          />
          <span className="pk-field__helper">{settingLimits(item)}</span>
        </label>
      )}
      <label className="pk-field">
        <span className="pk-field__label">Reason (kept in the audit log)</span>
        <input className="pk-input" name="reason" minLength={5} maxLength={500} required />
      </label>
      <Button type="submit" variant="secondary" loading={pending}>
        Save
      </Button>
      <Result state={state} />
    </ActionForm>
  );
}

/** Turn a feature on or off, with a reason. */
export function FlagForm({ item }: { item: FeatureFlagItem }) {
  const [state, action, pending] = useActionState(setFlagAction, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="key" value={item.key} />
      <input type="hidden" name="enabled" value={item.enabled ? 'false' : 'true'} />
      <label className="pk-field">
        <span className="pk-field__label">Reason (kept in the audit log)</span>
        <input className="pk-input" name="reason" minLength={5} maxLength={500} required />
      </label>
      <Button type="submit" variant={item.enabled ? 'secondary' : 'primary'} loading={pending}>
        {item.enabled ? 'Turn off' : 'Turn on'}
      </Button>
      <Result state={state} />
    </ActionForm>
  );
}
