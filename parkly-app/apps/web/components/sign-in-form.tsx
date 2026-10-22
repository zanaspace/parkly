'use client';

import { Button, Input } from '@parkly/ui';
import { useActionState } from 'react';
import { sendCode, verifyCode, type SignInState } from '../lib/auth/actions';

/** D-01/D-02 on the web: phone, then the SMS code (doc 03 §1.1). */
export function SignInForm({ next }: { next: string }) {
  const [phoneState, sendAction, sending] = useActionState<SignInState, FormData>(sendCode, {
    step: 'phone',
  });
  const [codeState, verifyAction, verifying] = useActionState<SignInState, FormData>(verifyCode, {
    step: 'code',
  });
  const phone = codeState.phone ?? phoneState.phone;
  const onCodeStep = phoneState.step === 'code' && codeState.step === 'code';

  if (!onCodeStep)
    return (
      <form action={sendAction} className="pk-stack">
        <Input
          label="Mobile number"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="0803 123 4567"
          required
          defaultValue={phone ?? ''}
        />
        {(phoneState.error ?? codeState.error) && (
          <p className="pk-notice pk-notice--error" role="alert">
            {phoneState.error ?? codeState.error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={sending}>
          {sending ? 'Sending…' : 'Send code'}
        </Button>
      </form>
    );

  return (
    <form action={verifyAction} className="pk-stack">
      <input type="hidden" name="phone" value={phone ?? ''} />
      <input type="hidden" name="next" value={next} />
      <p>We sent a 6-digit code to {phone}.</p>
      <Input
        label="Code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
      />
      <label className="pk-check">
        <input type="checkbox" name="terms" required /> I accept the Parkly Terms and Privacy
        Policy.
      </label>
      {codeState.error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {codeState.error}
        </p>
      )}
      <Button type="submit" fullWidth disabled={verifying}>
        {verifying ? 'Checking…' : 'Sign in'}
      </Button>
    </form>
  );
}
