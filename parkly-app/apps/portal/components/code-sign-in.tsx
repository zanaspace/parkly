'use client';

import { ActionForm, Button, Input } from '@parkly/ui';
import { useActionState, useState } from 'react';
import {
  sendSignInCode,
  verifySignInCode,
  type CodeMethod,
  type CodeSignInState,
} from '../lib/auth/code-actions';

/** One state for both steps, so a failed invite match can send them back to the start. */
const step = (prev: CodeSignInState, form: FormData) =>
  form.get('intent') === 'verify' ? verifySignInCode(prev, form) : sendSignInCode(prev, form);

/**
 * Attendant sign-in: email (or phone), then the 6-digit code. With an invite
 * token it also accepts the invite (doc 03 §2.3 step 2).
 */
export function CodeSignInForm({ next, inviteToken }: { next?: string; inviteToken?: string }) {
  const [method, setMethod] = useState<CodeMethod>('email');
  const [state, action, pending] = useActionState<CodeSignInState, FormData>(step, {
    step: 'start',
    method: 'email',
  });
  // "Use a different email or number" goes back without a round trip; the next send clears it.
  const [restart, setRestart] = useState(false);
  const submit = (form: FormData) => {
    setRestart(false);
    action(form);
  };
  const error = state.error && (
    <p className="pk-notice pk-notice--error" role="alert">
      {state.error}
    </p>
  );

  if (state.step === 'start' || restart)
    return (
      <ActionForm action={submit} className="pk-form" noValidate>
        <input type="hidden" name="intent" value="send" />
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
        {!restart && error}
        <Button type="submit" loading={pending} fullWidth>
          Send code
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          fullWidth
          onClick={() => setMethod(method === 'email' ? 'phone' : 'email')}
        >
          {method === 'email' ? 'Use a phone number instead' : 'Use email instead'}
        </Button>
      </ActionForm>
    );

  return (
    <ActionForm action={submit} className="pk-form" noValidate>
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="method" value={state.method} />
      <input type="hidden" name="contact" value={state.contact ?? ''} />
      {next && <input type="hidden" name="next" value={next} />}
      {inviteToken && <input type="hidden" name="inviteToken" value={inviteToken} />}
      <p>We sent a 6-digit code to {state.contact}. It expires in 5 minutes.</p>
      <Input
        label="Code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
      />
      {error}
      <Button type="submit" loading={pending} fullWidth>
        {inviteToken ? 'Sign in and accept' : 'Sign in'}
      </Button>
      <Button type="button" variant="ghost" size="sm" fullWidth onClick={() => setRestart(true)}>
        Use a different email or number
      </Button>
    </ActionForm>
  );
}
