import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { ListItem, ListItemGroup } from '../../src/components/ListItem';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { VehicleRow } from '../../src/components/VehicleRow';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { confirm } from '../../src/lib/confirm';
import { legalUrl } from '../../src/lib/legal-links';

const MAX_VEHICLES = 5;

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

/** D-26 Account settings: profile, vehicles, sign-out, deletion request. */
export default function Account() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    'device' | 'all' | 'delete' | 'export' | 'keep' | 'verify' | null
  >(null);
  const [method, setMethod] = useState<'FRSC_LICENSE' | 'NIN_PHONE'>('FRSC_LICENSE');
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('1990-01-01');
  const { me, vehicles } = auth;

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
    setBusy('verify');
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
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function signOut(scope: 'device' | 'all') {
    if (scope === 'all') {
      const ok = await confirm(
        'Sign out everywhere?',
        'You’ll be signed out on every phone and browser.',
        'Sign out all',
      );
      if (!ok) return;
    }
    setBusy(scope);
    await auth.signOut(scope);
  }

  async function requestDeletion() {
    const ok = await confirm(
      'Delete your account?',
      'We’ll deactivate your account now and erase your personal details within 30 days. Payment and booking records are kept as the law requires.',
      'Delete account',
      true,
    );
    if (!ok) return;
    setBusy('delete');
    setError(null);
    try {
      await api.requestDeletion();
      await auth.signOut('all');
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  async function downloadMyData() {
    setBusy('export');
    setError(null);
    try {
      const made = await api.requestDataExport();
      const link = await api.dataExportLink(made.requestId);
      await Linking.openURL(link.url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function keepAccount() {
    setBusy('keep');
    setError(null);
    try {
      await api.cancelDeletion();
      if (me) auth.setMe({ ...me, status: 'ACTIVE' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen showNav>
      {router.canGoBack() ? (
        <Button
          label="Back"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        />
      ) : null}
      <Text variant="heading.lg">Account</Text>
      <View style={{ gap: theme.space.stack.xs }}>
        <Text variant="body.lg">
          {[me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Your profile'}
        </Text>
        {me?.phoneLast4 ? <Text tone="secondary">{`Phone ending ${me.phoneLast4}`}</Text> : null}
        {me?.isVerifiedDriver ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={16} color={theme.badge.verified.fg} />
            <Text variant="label.sm" style={{ color: theme.badge.verified.fg }}>
              Verified Driver (Tier 2 KYC)
            </Text>
          </View>
        ) : null}
      </View>

      {!me?.isVerifiedDriver ? (
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
            Required for 30-day monthly passes and gated car parks. Verified against FRSC or NIMC;
            we only store a masked reference.
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
                  method === 'FRSC_LICENSE' ? theme.color.border.brand : theme.color.border.default,
                backgroundColor:
                  method === 'FRSC_LICENSE'
                    ? theme.color.bg['brand-subtle']
                    : pressed
                      ? theme.color.bg.muted
                      : theme.color.bg.surface,
              })}
            >
              <Text
                variant="body.sm"
                tone={method === 'FRSC_LICENSE' ? 'brand' : 'primary'}
                style={{
                  textAlign: 'center',
                  fontWeight: method === 'FRSC_LICENSE' ? '600' : '400',
                }}
              >
                FRSC Driver’s License
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
                  method === 'NIN_PHONE' ? theme.color.border.brand : theme.color.border.default,
                backgroundColor:
                  method === 'NIN_PHONE'
                    ? theme.color.bg['brand-subtle']
                    : pressed
                      ? theme.color.bg.muted
                      : theme.color.bg.surface,
              })}
            >
              <Text
                variant="body.sm"
                tone={method === 'NIN_PHONE' ? 'brand' : 'primary'}
                style={{ textAlign: 'center', fontWeight: method === 'NIN_PHONE' ? '600' : '400' }}
              >
                11-digit NIN
              </Text>
            </Pressable>
          </View>
          <Input
            label={method === 'FRSC_LICENSE' ? 'License number' : '11-digit NIN'}
            value={idNumber}
            onChangeText={(t) => {
              setIdNumber(t);
              if (error) setError(null);
            }}
            autoCapitalize="characters"
            placeholder={method === 'FRSC_LICENSE' ? 'e.g. ABC12345AA12' : 'e.g. 12345678901'}
          />
          {method === 'FRSC_LICENSE' ? (
            <Input
              label="Date of birth (YYYY-MM-DD)"
              value={dob}
              onChangeText={(t) => {
                setDob(t);
                if (error) setError(null);
              }}
              placeholder="1990-01-01"
            />
          ) : null}
          {error ? <Notice message={error} /> : null}
          <Button
            label="Verify my driver identity"
            fullWidth
            loading={busy === 'verify'}
            onPress={() => void verifyIdentity()}
          />
        </View>
      ) : null}

      <Text variant="heading.sm">Vehicles</Text>
      {error && me?.isVerifiedDriver ? <Notice message={error} /> : null}
      {vehicles && vehicles.length > 0 ? (
        vehicles.map((v) => (
          <VehicleRow key={v.id} vehicle={v} onChanged={auth.refreshVehicles} onError={setError} />
        ))
      ) : (
        <Text tone="secondary">No vehicles yet.</Text>
      )}
      {(vehicles?.length ?? 0) < MAX_VEHICLES ? (
        <Button
          label="Add vehicle"
          variant="secondary"
          onPress={() => router.push('/add-vehicle')}
        />
      ) : null}

      <Text variant="heading.sm">Settings</Text>
      <ListItemGroup>
        <ListItem
          icon={<Ionicons name="download-outline" size={18} color={theme.color.text.brand} />}
          label="Download my data"
          description="A copy of the personal data Parkly holds about you."
          loading={busy === 'export'}
          onPress={() => void downloadMyData()}
        />
        <ListItem
          icon={
            <Ionicons name="document-text-outline" size={18} color={theme.color.text.secondary} />
          }
          label="Terms of Service"
          onPress={() => void Linking.openURL(legalUrl('terms'))}
        />
        <ListItem
          icon={
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={theme.color.text.secondary}
            />
          }
          label="Privacy Notice"
          onPress={() => void Linking.openURL(legalUrl('privacy'))}
        />
        <ListItem
          icon={<Ionicons name="log-out-outline" size={18} color={theme.color.text.secondary} />}
          label="Sign out of this phone"
          loading={busy === 'device'}
          onPress={() => void signOut('device')}
        />
        <ListItem
          icon={
            <Ionicons name="phone-portrait-outline" size={18} color={theme.color.text.secondary} />
          }
          label="Sign out everywhere"
          loading={busy === 'all'}
          onPress={() => void signOut('all')}
        />
        {me?.status === 'PENDING_DELETION' ? (
          <ListItem
            icon={<Ionicons name="refresh-outline" size={18} color={theme.color.text.brand} />}
            label="Keep my account"
            description="Your account is set to be erased. You can change your mind within 30 days."
            loading={busy === 'keep'}
            showChevron={false}
            onPress={() => void keepAccount()}
          />
        ) : (
          <ListItem
            icon={<Ionicons name="trash-outline" size={18} color={theme.color.status.danger.fg} />}
            label="Delete my account"
            description="Your details are erased after 30 days."
            tone="danger"
            loading={busy === 'delete'}
            showChevron={false}
            onPress={() => void requestDeletion()}
          />
        )}
      </ListItemGroup>
    </Screen>
  );
}
