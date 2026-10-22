'use client';

import { Button, Input, Text, ActionForm } from '@parkly/ui';
import { useActionState, useState } from 'react';
import {
  confirmEnrollment,
  requestPasswordReset,
  signIn,
  startEnrollment,
  updatePassword,
  verifyMfa,
  type EnrollStart,
} from '../lib/auth/actions';
import { MIN_PASSWORD_LENGTH } from '../lib/auth/messages';

function Notice({ tone, children }: { tone: 'error' | 'info'; children: string }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <input type="hidden" name="next" value={next} />
      <Input label="Email address" name="email" type="email" autoComplete="username" required />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Sign in
      </Button>
    </ActionForm>
  );
}

export function MfaVerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <input type="hidden" name="next" value={next} />
      <Input
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        helper="Open your authenticator app and enter the current code for Parkly."
        required
      />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Verify
      </Button>
    </ActionForm>
  );
}

/** Enrol a TOTP factor: start (QR + secret) → confirm the first code → offer a backup factor. */
export function MfaEnrollFlow({ existingFactors }: { existingFactors: number }) {
  const [enrolment, setEnrolment] = useState<EnrollStart | null>(null);
  const [starting, setStarting] = useState(false);
  const [state, action, pending] = useActionState(confirmEnrollment, undefined);

  const start = async () => {
    setStarting(true);
    setEnrolment(await startEnrollment());
    setStarting(false);
  };

  if (state?.done) {
    const count = state.factorCount ?? 1;
    return (
      <div className="pk-form">
        <Notice tone="info">
          Authenticator added. Your account is now protected with two-step sign-in.
        </Notice>
        {count < 2 && (
          <Text tone="secondary">
            There are no recovery codes. Add a second authenticator (for example on a backup phone)
            so you can still sign in if you lose this one.
          </Text>
        )}
        <div className="pk-row">
          {count < 2 && (
            <Button
              variant="secondary"
              onClick={() => {
                window.location.assign('/mfa/enroll?backup=1');
              }}
            >
              Add a backup authenticator
            </Button>
          )}
          <Button
            onClick={() => {
              window.location.assign('/');
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  if (!enrolment || 'error' in enrolment) {
    return (
      <div className="pk-form">
        <Text tone="secondary">
          {existingFactors === 0
            ? 'Two-step sign-in is required for your role. You’ll need an authenticator app such as Google Authenticator or Microsoft Authenticator.'
            : 'Add another authenticator as a backup.'}
        </Text>
        {enrolment && 'error' in enrolment && <Notice tone="error">{enrolment.error}</Notice>}
        <Button onClick={start} loading={starting} fullWidth>
          Set up authenticator
        </Button>
      </div>
    );
  }

  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <Text>1. Scan this QR code with your authenticator app.</Text>
      {/* Supabase returns the QR as an SVG data URI; next/image adds nothing for it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pk-qr"
        src={enrolment.qrCode}
        alt="QR code to add Parkly to your authenticator app"
        width={200}
        height={200}
      />
      <Text variant="body-sm" tone="secondary">
        Can’t scan? Enter this key instead: <code className="pk-code">{enrolment.secret}</code>
      </Text>
      <Text>2. Enter the 6-digit code it shows.</Text>
      <input type="hidden" name="factorId" value={enrolment.factorId} />
      <Input
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
      />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Turn on two-step sign-in
      </Button>
    </ActionForm>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <Input label="Email address" name="email" type="email" autoComplete="username" required />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.message && <Notice tone="info">{state.message}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Send reset link
      </Button>
    </ActionForm>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        helper={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easier to remember.`}
        required
      />
      <Input
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Save password
      </Button>
    </ActionForm>
  );
}
