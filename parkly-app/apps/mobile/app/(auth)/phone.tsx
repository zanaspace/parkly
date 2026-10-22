import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { isDevBypass } from '../../src/auth/dev-auth';
import { requestCode } from '../../src/auth/request-code';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { useCountdown } from '../../src/hooks/useCountdown';
import { formatCountdown } from '../../src/logic/countdown';
import { phoneFromInput } from '../../src/logic/forms';

/** D-02 Enter phone. +234 is fixed; a leading 0 is accepted and stripped. */
export default function Phone() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wait = useCountdown();

  const phone = phoneFromInput(input);
  const fieldError =
    touched && input.trim() && !phone ? 'Enter a valid Nigerian mobile number.' : undefined;

  async function submit() {
    setTouched(true);
    if (!phone || wait.running) return;
    setBusy(true);
    setError(null);
    const result = await requestCode(phone);
    setBusy(false);
    if (result.ok) {
      router.push({ pathname: '/otp', params: { phone } });
      return;
    }
    setError(result.message);
    if (result.waitSeconds) wait.start(result.waitSeconds);
  }

  async function quickDevLogin() {
    setBusy(true);
    setError(null);
    try {
      const targetPhone = phone ?? '+2348031234567';
      await auth.signInDev(targetPhone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick sign-in failed');
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <View style={{ gap: theme.space.stack.sm }}>
          <Button
            label={wait.running ? `Try again in ${formatCountdown(wait.remaining)}` : 'Send code'}
            size="lg"
            fullWidth
            loading={busy}
            disabled={!phone || wait.running}
            onPress={() => void submit()}
          />
          {isDevBypass() ? (
            <Button
              label="⚡ Quick Dev Sign In (Bypass SMS)"
              variant="secondary"
              size="lg"
              fullWidth
              loading={busy}
              onPress={() => void quickDevLogin()}
            />
          ) : null}
        </View>
      }
    >
      <Text variant="heading.lg">What’s your phone number?</Text>
      <Text tone="secondary">We’ll text you a 6-digit code to sign in. No password needed.</Text>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm, alignItems: 'flex-end' }}>
        <View
          style={{
            height: theme.input.height.md,
            justifyContent: 'center',
            paddingHorizontal: theme.space.inset.sm,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="body.lg">+234</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Mobile number"
            value={input}
            onChangeText={(v) => {
              setInput(v);
              setError(null);
            }}
            onBlur={() => setTouched(true)}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder="803 123 4567"
            onSubmitEditing={() => void submit()}
            {...(fieldError ? { error: fieldError } : {})}
          />
        </View>
      </View>
      {isDevBypass() ? (
        <Notice
          kind="info"
          message="⚡ Dev Mode: Paid SMS is bypassed. Tap 'Quick Dev Sign In' or enter any number and code 123456."
        />
      ) : null}
      {error ? <Notice message={error} /> : null}
      <Button label="Use email instead" variant="ghost" onPress={() => router.replace('/email')} />
    </Screen>
  );
}
