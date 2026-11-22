import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { Notice } from './Notice';

export function DriverVerificationCard() {
  const theme = useTheme();
  const auth = useAuth();
  const [method, setMethod] = useState<'FRSC_LICENSE' | 'NIN_PHONE'>('FRSC_LICENSE');
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('1990-01-01');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.me?.isVerifiedDriver) return null;

  async function verifyIdentity() {
    if (!idNumber.trim()) {
      setError(
        method === 'FRSC_LICENSE'
          ? 'Please enter your FRSC driver’s license number.'
          : 'Please enter your 11-digit NIN.',
      );
      return;
    }
    if (method === 'FRSC_LICENSE' && !dob.trim()) {
      setError('Please enter your date of birth (YYYY-MM-DD).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.submitVerification(
        method === 'FRSC_LICENSE'
          ? { method: 'FRSC_LICENSE', idNumber: idNumber.trim(), dateOfBirth: dob.trim() }
          : { method: 'NIN_PHONE', idNumber: idNumber.trim() },
      );
      const updated = await api.me();
      auth.setMe(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        backgroundColor: theme.card.bg,
        borderColor: theme.card.border,
        borderWidth: 1,
        borderRadius: theme.card.radius,
        padding: theme.card.padding,
        gap: theme.space.stack.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="shield-outline" size={20} color={theme.color.text.brand} />
        <Text variant="heading.sm">Verified Driver (60-second check)</Text>
      </View>
      <Text variant="body.sm" tone="secondary">
        Required for 30-day monthly passes and gated car parks. Verified against FRSC or NIMC; we
        only store a masked reference.
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: method === 'FRSC_LICENSE' }}
          accessibilityLabel="FRSC Driver's License"
          onPress={() => {
            setMethod('FRSC_LICENSE');
            setError(null);
          }}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 42,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: theme.space[2],
            paddingHorizontal: theme.space[3],
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor:
              method === 'FRSC_LICENSE'
                ? theme.badge.verified.fg
                : pressed
                  ? theme.color.border.brand
                  : theme.color.border.default,
            backgroundColor:
              method === 'FRSC_LICENSE' ? theme.color.bg['brand-subtle'] : theme.color.bg.surface,
          })}
        >
          <Text
            variant="label.md"
            style={{
              color:
                method === 'FRSC_LICENSE' ? theme.badge.verified.fg : theme.color.text.secondary,
              fontWeight: method === 'FRSC_LICENSE' ? '700' : '500',
            }}
          >
            FRSC Driver's License
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: method === 'NIN_PHONE' }}
          accessibilityLabel="11-digit NIN"
          onPress={() => {
            setMethod('NIN_PHONE');
            setError(null);
          }}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 42,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: theme.space[2],
            paddingHorizontal: theme.space[3],
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor:
              method === 'NIN_PHONE'
                ? theme.badge.verified.fg
                : pressed
                  ? theme.color.border.brand
                  : theme.color.border.default,
            backgroundColor:
              method === 'NIN_PHONE' ? theme.color.bg['brand-subtle'] : theme.color.bg.surface,
          })}
        >
          <Text
            variant="label.md"
            style={{
              color: method === 'NIN_PHONE' ? theme.badge.verified.fg : theme.color.text.secondary,
              fontWeight: method === 'NIN_PHONE' ? '700' : '500',
            }}
          >
            11-digit NIN
          </Text>
        </Pressable>
      </View>
      <Input
        label={
          method === 'FRSC_LICENSE'
            ? "FRSC Driver's License Number"
            : '11-digit National ID Number (NIN)'
        }
        placeholder={method === 'FRSC_LICENSE' ? 'e.g. AAA00000AA00' : 'e.g. 12345678901'}
        value={idNumber}
        onChangeText={setIdNumber}
        autoCapitalize={method === 'FRSC_LICENSE' ? 'characters' : 'none'}
        keyboardType={method === 'NIN_PHONE' ? 'number-pad' : 'default'}
      />
      {method === 'FRSC_LICENSE' ? (
        <Input
          label="Date of birth (YYYY-MM-DD)"
          placeholder="1990-01-01"
          value={dob}
          onChangeText={setDob}
          keyboardType="numbers-and-punctuation"
        />
      ) : null}
      {error ? <Notice message={error} /> : null}
      <Button
        label={busy ? 'Verifying with official records…' : 'Verify in 60 seconds'}
        loading={busy}
        onPress={() => void verifyIdentity()}
      />
    </View>
  );
}
