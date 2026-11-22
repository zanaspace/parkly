import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { useProfileMode } from '../../src/context/ProfileModeContext';

/**
 * Dual-Profile Driver Linking Screen (1 Account · 2 Profiles).
 * Matches product specification: Account → Work Email → 6-Digit OTP → Dual-Profile Switcher.
 */
export default function WorkEmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    corporateJoined,
    corporateCompany,
    workEmail,
    sendWorkEmailOtp,
    linkWorkEmail,
    setMode,
    leaveCorporate,
  } = useProfileMode();

  const [step, setStep] = useState<'EMAIL' | 'OTP' | 'SUCCESS'>(() =>
    corporateJoined ? 'SUCCESS' : 'EMAIL',
  );
  const [emailInput, setEmailInput] = useState(workEmail || '');
  const [otpInput, setOtpInput] = useState('');
  const [detectedCompany, setDetectedCompany] = useState<string | null>(corporateCompany);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSendOtp = async () => {
    const clean = emailInput.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(clean)) {
      setError('Please enter a valid corporate email address (e.g. zana@parkly.com).');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await sendWorkEmailOtp(clean);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Could not send verification code.');
      return;
    }
    setDetectedCompany(res.company || null);
    setInfoMessage(res.message || `Verification code sent to ${clean}`);
    setStep('OTP');
  };

  const handleVerifyOtp = async () => {
    if (!otpInput.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await linkWorkEmail(emailInput.trim().toLowerCase(), otpInput.trim());
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Invalid or expired 6-digit code.');
      return;
    }
    setDetectedCompany(res.company || null);
    setStep('SUCCESS');
  };

  const handleDisconnect = async () => {
    await leaveCorporate();
    setStep('EMAIL');
    setEmailInput('');
    setOtpInput('');
    setDetectedCompany(null);
  };

  return (
    <Screen showNav={false}>
      {/* Top Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Account"
          onPress={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.color.bg.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.color.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="heading.md" style={{ fontWeight: '800' }}>
            Work Email Linking
          </Text>
          <Text variant="body.sm" tone="secondary">
            1 Account · 2 Profiles (Personal + Corporate)
          </Text>
        </View>
      </View>

      {/* Hero Badge Banner */}
      <View
        style={{
          backgroundColor: theme.color.bg['brand-subtle'],
          borderWidth: 1,
          borderColor: theme.color.border.brand,
          borderRadius: 18,
          padding: 16,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="briefcase" size={20} color={theme.color.text.brand} />
          <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
            Seamless Dual-Profile Driver Linking
          </Text>
        </View>
        <Text variant="body.sm" tone="secondary" style={{ fontSize: 12, lineHeight: 17 }}>
          No need to download a second app. Simply link your work email to activate your company’s
          parking subsidy with our 1-tap profile switcher.
        </Text>
      </View>

      {/* Step Progress Pills */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View
          style={{
            flex: 1,
            paddingVertical: 6,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            backgroundColor:
              step === 'EMAIL' ? theme.color.action.primary.bg : theme.color.bg.subtle,
          }}
        >
          <Text
            variant="label.sm"
            style={{
              color: step === 'EMAIL' ? '#FFFFFF' : theme.color.text.secondary,
              fontWeight: '700',
              fontSize: 11,
            }}
          >
            1. Work Email
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            paddingVertical: 6,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            backgroundColor: step === 'OTP' ? theme.color.action.primary.bg : theme.color.bg.subtle,
          }}
        >
          <Text
            variant="label.sm"
            style={{
              color: step === 'OTP' ? '#FFFFFF' : theme.color.text.secondary,
              fontWeight: '700',
              fontSize: 11,
            }}
          >
            2. Verify OTP
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            paddingVertical: 6,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            backgroundColor:
              step === 'SUCCESS' ? theme.color.status.success.bg : theme.color.bg.subtle,
          }}
        >
          <Text
            variant="label.sm"
            style={{
              color:
                step === 'SUCCESS' ? theme.color.status.success.fg : theme.color.text.secondary,
              fontWeight: '700',
              fontSize: 11,
            }}
          >
            3. Linked
          </Text>
        </View>
      </View>

      {error ? <Notice kind="warning" message={error} /> : null}
      {infoMessage && step === 'OTP' ? <Notice kind="info" message={infoMessage} /> : null}

      {/* Step 1: Input Work Email */}
      {step === 'EMAIL' ? (
        <View
          style={{
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: theme.card.border,
            borderRadius: 18,
            padding: 16,
            gap: 14,
          }}
        >
          <Text variant="label.lg">Enter your corporate email</Text>
          <Input
            label="Work Email Address"
            placeholder="zana@parkly.com"
            value={emailInput}
            onChangeText={setEmailInput}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          <Text variant="body.sm" tone="secondary" style={{ fontSize: 11 }}>
            We’ll verify your email domain and send a 6-digit OTP to link your account.
          </Text>
          <Button
            label={loading ? 'Checking company domain…' : 'Send 6-digit OTP'}
            fullWidth
            disabled={loading || !emailInput.trim()}
            onPress={() => void handleSendOtp()}
          />
        </View>
      ) : null}

      {/* Step 2: 6-Digit OTP */}
      {step === 'OTP' ? (
        <View
          style={{
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: theme.card.border,
            borderRadius: 18,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ gap: 4 }}>
            <Text variant="label.lg">Enter 6-digit OTP</Text>
            <Text variant="body.sm" tone="secondary">
              Sent to {emailInput} {detectedCompany ? `(${detectedCompany})` : ''}
            </Text>
          </View>

          <Input
            label="Verification Code"
            placeholder="000000"
            value={otpInput}
            onChangeText={setOtpInput}
            keyboardType="number-pad"
            maxLength={6}
          />

          <Button
            label={loading ? 'Verifying…' : 'Verify & Link Corporate Profile'}
            fullWidth
            disabled={loading || otpInput.trim().length < 4}
            onPress={() => void handleVerifyOtp()}
          />

          <Button
            label="Change email address"
            variant="ghost"
            size="sm"
            fullWidth
            onPress={() => {
              setStep('EMAIL');
              setError(null);
            }}
          />
        </View>
      ) : null}

      {/* Step 3: Success State */}
      {step === 'SUCCESS' ? (
        <View
          style={{
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: theme.card.border,
            borderRadius: 18,
            padding: 18,
            gap: 16,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.color.bg['brand-subtle'],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark-circle" size={32} color={theme.color.text.brand} />
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text variant="heading.sm" style={{ fontWeight: '800', textAlign: 'center' }}>
              Dual-Profile Activated!
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ textAlign: 'center' }}>
              Connected to {detectedCompany || corporateCompany || 'Corporate Fleet'}
            </Text>
            {workEmail ? (
              <Text variant="code.sm" tone="brand" style={{ fontWeight: '700' }}>
                {workEmail}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              width: '100%',
              backgroundColor: theme.color.bg.subtle,
              borderRadius: 12,
              padding: 12,
              gap: 4,
            }}
          >
            <Text variant="label.sm" style={{ fontWeight: '700' }}>
              Corporate Parking Perks:
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
              • 100% employer-subsidized parking (₦0 out-of-pocket)
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
              • Monthly centralized invoicing billed to your company
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
              • 1-tap Personal ⇄ Corporate switcher in top header & checkout
            </Text>
          </View>

          <Button
            label="Switch to Corporate Mode Now"
            fullWidth
            onPress={() => {
              void setMode('CORPORATE');
              router.replace('/home');
            }}
          />

          <Button
            label="Back to Account"
            variant="secondary"
            fullWidth
            onPress={() => router.replace('/account')}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Disconnect work email"
            onPress={() => void handleDisconnect()}
            style={{ paddingVertical: 4 }}
          >
            <Text variant="label.sm" tone="tertiary" style={{ fontSize: 11 }}>
              Disconnect work email
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}
