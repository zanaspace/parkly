import { AUTH_ERROR_MESSAGES, mapSupabaseAuthError } from '@parkly/contracts';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { isDevBypass } from '../../src/auth/dev-auth';
import { requestCode, requestEmailCode } from '../../src/auth/request-code';
import { useCaptcha } from '../../src/components/Captcha';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { useCountdown } from '../../src/hooks/useCountdown';
import { formatCountdown } from '../../src/logic/countdown';
import { formatPhone, OTP_LENGTH, sanitiseOtp } from '../../src/logic/forms';
import { supabase } from '../../src/lib/supabase';

const RESEND_AFTER_SEC = 60;

/**
 * D-03 Enter the 6-digit code. On success Supabase stores the session; the
 * AuthProvider then calls /v1/auth/bootstrap and the route guard moves on.
 */
export default function Otp() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  // One of the two: a phone (SMS) or an email address (ADR 0015).
  const { phone, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const resend = useCountdown();
  const { start } = resend;
  const captcha = useCaptcha();

  useEffect(() => start(RESEND_AFTER_SEC), [start]);

  if (!phone && !email) {
    return (
      <Screen>
        <Notice message="Enter your email address first." />
        <Button label="Back" onPress={() => router.replace('/email')} />
      </Screen>
    );
  }

  const signedIn = !!auth.session;

  async function verify(token: string) {
    if ((!phone && !email) || token.length !== OTP_LENGTH) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    if (isDevBypass() && phone) {
      try {
        await auth.signInDev(phone);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not sign in in dev mode');
      } finally {
        setBusy(false);
      }
      return;
    }
    const { error: err } = email
      ? await supabase.auth.verifyOtp({ email, token, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: phone ?? '', token, type: 'sms' });
    setBusy(false);
    if (err) {
      setError(AUTH_ERROR_MESSAGES[mapSupabaseAuthError({ code: err.code, status: err.status })]);
      setCode('');
    }
  }

  async function resendCode() {
    if (!captcha.ready) return;
    setError(null);
    const result = email
      ? await requestEmailCode(email, captcha.token)
      : phone
        ? await requestCode(phone, captcha.token)
        : null;
    captcha.used();
    if (!result) return;
    if (result.ok) {
      setInfo('A new code is on its way.');
      start(RESEND_AFTER_SEC);
    } else {
      setError(result.message);
      start(result.waitSeconds ?? RESEND_AFTER_SEC);
    }
  }

  if (signedIn) {
    // Session exists; waiting for /v1/auth/bootstrap (or showing its error).
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: theme.space.stack.md,
          }}
        >
          {auth.bootstrapError ? (
            <>
              <Notice message={auth.bootstrapError} />
              <Button label="Try again" onPress={() => void auth.retryBootstrap()} />
            </>
          ) : (
            <>
              <ActivityIndicator color={theme.color.action.primary.bg} size="large" />
              <Text tone="secondary">Setting up your account…</Text>
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label="Verify"
            size="lg"
            fullWidth
            loading={busy}
            disabled={code.length !== OTP_LENGTH}
            onPress={() => void verify(code)}
          />
          <Button
            label={
              resend.running ? `Resend code in ${formatCountdown(resend.remaining)}` : 'Resend code'
            }
            variant="ghost"
            fullWidth
            disabled={resend.running || !captcha.ready}
            onPress={() => void resendCode()}
          />
        </>
      }
    >
      <Text variant="heading.lg">Enter the code</Text>
      <Text tone="secondary">{`We sent a 6-digit code to ${email ?? formatPhone(phone ?? '')}. It expires in 5 minutes.`}</Text>
      <Input
        label="6-digit code"
        value={code}
        onChangeText={(v) => {
          const next = sanitiseOtp(v);
          setCode(next);
          if (next.length === OTP_LENGTH) void verify(next);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={email ? 'one-time-code' : 'sms-otp'}
        maxLength={OTP_LENGTH}
        autoFocus
        editable={!busy}
      />
      {resend.running ? null : captcha.widget}
      {error ? <Notice message={error} /> : null}
      {info ? <Notice kind="info" message={info} /> : null}
      {isDevBypass() ? (
        <Notice
          kind="info"
          message="⚡ Dev Mode: SMS is bypassed. Enter any 6 digits (e.g. 123456) or tap Verify to sign in."
        />
      ) : null}
      <Button label="Change number" variant="ghost" onPress={() => router.replace('/phone')} />
    </Screen>
  );
}
