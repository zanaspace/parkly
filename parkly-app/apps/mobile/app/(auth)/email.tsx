import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { requestEmailCode } from '../../src/auth/request-code';
import { useCaptcha } from '../../src/components/Captcha';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { useCountdown } from '../../src/hooks/useCountdown';
import { formatCountdown } from '../../src/logic/countdown';
import { emailFromInput } from '../../src/logic/forms';

/** D-02 with email (ADR 0015): the sign-in until SMS codes are live. */
export default function Email() {
  const theme = useTheme();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wait = useCountdown();
  const captcha = useCaptcha();

  const email = emailFromInput(input);
  const fieldError = touched && input.trim() && !email ? 'Enter a valid email address.' : undefined;

  async function submit() {
    setTouched(true);
    if (!email || wait.running || !captcha.ready) return;
    setBusy(true);
    setError(null);
    const result = await requestEmailCode(email, captcha.token);
    captcha.used();
    setBusy(false);
    if (result.ok) {
      router.push({ pathname: '/otp', params: { email } });
      return;
    }
    setError(result.message);
    if (result.waitSeconds) wait.start(result.waitSeconds);
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
            disabled={!email || wait.running || !captcha.ready}
            onPress={() => void submit()}
          />
          <Button
            label="Use a phone number instead"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/phone')}
          />
        </View>
      }
    >
      <Text variant="heading.lg">What’s your email?</Text>
      <Text tone="secondary">We’ll email you a 6-digit code to sign in. No password needed.</Text>
      <Input
        label="Email address"
        value={input}
        onChangeText={(v) => {
          setInput(v);
          setError(null);
        }}
        onBlur={() => setTouched(true)}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="you@example.com"
        onSubmitEditing={() => void submit()}
        {...(fieldError ? { error: fieldError } : {})}
      />
      {captcha.widget}
      {error ? <Notice message={error} /> : null}
    </Screen>
  );
}
