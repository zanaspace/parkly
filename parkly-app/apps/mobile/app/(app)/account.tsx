import type { Vehicle } from '@parkly/contracts';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { confirm } from '../../src/lib/confirm';
import { legalUrl } from '../../src/lib/legal-links';

const MAX_VEHICLES = 5;

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

function VehicleRow({
  vehicle,
  onChanged,
  onError,
}: {
  vehicle: Vehicle;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const details = [vehicle.colour, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (err) {
      onError(errorText(err));
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="code.md">{vehicle.plateNorm}</Text>
        {vehicle.isDefault ? (
          <Text variant="label.sm" tone="brand">
            Default
          </Text>
        ) : null}
      </View>
      {details ? <Text tone="secondary">{details}</Text> : null}
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm, flexWrap: 'wrap' }}>
        {!vehicle.isDefault ? (
          <Button
            label="Make default"
            size="sm"
            variant="secondary"
            disabled={busy}
            onPress={() => void run(() => api.setDefaultVehicle(vehicle.id))}
          />
        ) : null}
        <Button
          label="Remove"
          size="sm"
          variant="ghost"
          disabled={busy}
          accessibilityHint={`Removes ${vehicle.plateNorm} from your account`}
          onPress={() =>
            void confirm(
              'Remove vehicle?',
              `${vehicle.plateNorm} will be removed from your account.`,
              'Remove',
              true,
            ).then((ok) => (ok ? run(() => api.removeVehicle(vehicle.id)) : undefined))
          }
        />
      </View>
    </View>
  );
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
          <Text variant="label.sm" style={{ color: theme.badge.verified.fg }}>
            ✓ Verified Driver (Tier 2 KYC)
          </Text>
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
          <Text variant="heading.sm">Verified Driver (60-second check)</Text>
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
                paddingHorizontal: theme.space[2],
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
                FRSC License
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
                paddingHorizontal: theme.space[2],
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

      <Text variant="heading.sm">Sign out</Text>
      <Button
        label="Sign out of this phone"
        variant="secondary"
        fullWidth
        loading={busy === 'device'}
        onPress={() => void signOut('device')}
      />
      <Button
        label="Sign out everywhere"
        variant="ghost"
        fullWidth
        loading={busy === 'all'}
        onPress={() => void signOut('all')}
      />

      <Text variant="heading.sm">Legal & policies</Text>
      <View style={{ gap: theme.space.stack.xs }}>
        <Button
          label="Terms of Service"
          variant="secondary"
          fullWidth
          onPress={() => void Linking.openURL(legalUrl('terms'))}
        />
        <Button
          label="Privacy Notice"
          variant="secondary"
          fullWidth
          onPress={() => void Linking.openURL(legalUrl('privacy'))}
        />
      </View>

      <Text variant="heading.sm">Your data</Text>
      <Text tone="secondary">
        Get a copy of the personal data Parkly holds about you. The link works for 15 minutes.
      </Text>
      <Button
        label="Download my data"
        variant="secondary"
        fullWidth
        loading={busy === 'export'}
        onPress={() => void downloadMyData()}
      />

      <Text variant="heading.sm">Delete account</Text>
      {me?.status === 'PENDING_DELETION' ? (
        <>
          <Text tone="secondary">
            Your account is set to be erased. You can still change your mind for 30 days after you
            asked.
          </Text>
          <Button
            label="Keep my account"
            fullWidth
            loading={busy === 'keep'}
            onPress={() => void keepAccount()}
          />
        </>
      ) : (
        <>
          <Text tone="secondary">
            Your details are erased after 30 days. Until then you can change your mind.
          </Text>
          <Button
            label="Delete my account"
            variant="danger"
            fullWidth
            loading={busy === 'delete'}
            onPress={() => void requestDeletion()}
          />
        </>
      )}
    </Screen>
  );
}
