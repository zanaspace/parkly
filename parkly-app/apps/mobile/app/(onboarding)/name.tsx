import { Button, Input, Text } from '@parkly/ui-native';
import { useState } from 'react';
import { useAuth } from '../../src/auth/AuthProvider';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { nameError } from '../../src/logic/forms';

/** D-04 Your name → PATCH /v1/me. */
export default function Name() {
  const auth = useAuth();
  const [first, setFirst] = useState(auth.me?.firstName ?? '');
  const [last, setLast] = useState(auth.me?.lastName ?? '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstError = nameError(first, 'First name');
  const lastError = nameError(last, 'Last name');

  async function submit() {
    setTouched(true);
    if (firstError || lastError) return;
    setBusy(true);
    setError(null);
    try {
      auth.setMe(await api.updateMe({ firstName: first.trim(), lastName: last.trim() }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not save your name. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <Button label="Continue" size="lg" fullWidth loading={busy} onPress={() => void submit()} />
      }
    >
      <Text variant="heading.lg">What should we call you?</Text>
      <Text tone="secondary">Attendants see your first name when you arrive.</Text>
      <Input
        label="First name"
        value={first}
        onChangeText={setFirst}
        autoComplete="given-name"
        textContentType="givenName"
        autoCapitalize="words"
        {...(touched && firstError ? { error: firstError } : {})}
      />
      <Input
        label="Last name"
        value={last}
        onChangeText={setLast}
        autoComplete="family-name"
        textContentType="familyName"
        autoCapitalize="words"
        {...(touched && lastError ? { error: lastError } : {})}
      />
      {error ? <Notice message={error} /> : null}
    </Screen>
  );
}
