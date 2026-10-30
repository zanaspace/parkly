'use client';

import { Button, Input, ActionForm, Turnstile } from '@parkly/ui';
import { useActionState, useState } from 'react';
import { sendCode, verifyCode, type SignInMethod, type SignInState } from '../lib/auth/actions';

/** D-01/D-02 on the web: email (or phone), then the 6-digit code (doc 03 §1.1, ADR 0015). */
export function SignInForm({ next }: { next: string }) {
  const [method, setMethod] = useState<SignInMethod>('email');
  const [sent, sendAction, sending] = useActionState<SignInState, FormData>(sendCode, {
    step: 'start',
    method: 'email',
  });
  const [checked, verifyAction, verifying] = useActionState<SignInState, FormData>(verifyCode, {
    step: 'code',
    method: 'email',
  });
  const contact = checked.contact ?? sent.contact;
  const onCodeStep = sent.step === 'code' && checked.step === 'code';
  const error = onCodeStep ? checked.error : (sent.error ?? checked.error);

  if (!onCodeStep)
    return (
      <ActionForm action={sendAction} className="pk-stack">
        <input type="hidden" name="method" value={method} />
        {method === 'email' ? (
          <Input
            key="email"
            label="Email address"
            name="contact"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        ) : (
          <Input
            key="phone"
            label="Mobile number"
            name="contact"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="0803 123 4567"
            required
          />
        )}
        <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        {error && (
          <p className="pk-notice pk-notice--error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={sending}>
          {sending ? 'Sending…' : 'Send code'}
        </Button>
        <button
          type="button"
          className="pk-link pk-link--button"
          onClick={() => setMethod(method === 'email' ? 'phone' : 'email')}
        >
          {method === 'email' ? 'Use a phone number instead' : 'Use email instead'}
        </button>
      </ActionForm>
    );

  return (
    <ActionForm action={verifyAction} className="pk-stack">
      <input type="hidden" name="method" value={sent.method} />
      <input type="hidden" name="contact" value={contact ?? ''} />
      <input type="hidden" name="next" value={next} />
      <p>We sent a 6-digit code to {contact}.</p>
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
      {error && (
        <p className="pk-notice pk-notice--error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth disabled={verifying}>
        {verifying ? 'Checking…' : 'Sign in'}
      </Button>
    </ActionForm>
  );
}
