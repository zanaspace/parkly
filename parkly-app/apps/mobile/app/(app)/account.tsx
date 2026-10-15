import type { Vehicle } from '@parkly/contracts';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { confirm } from '../../src/lib/confirm';

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
  const [busy, setBusy] = useState<'device' | 'all' | 'delete' | null>(null);
  const { me, vehicles } = auth;

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

  return (
    <Screen>
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
      <Text variant="heading.lg">Account</Text>
      <View style={{ gap: theme.space.stack.xs }}>
        <Text variant="body.lg">
          {[me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Your profile'}
        </Text>
        {me?.phoneLast4 ? <Text tone="secondary">{`Phone ending ${me.phoneLast4}`}</Text> : null}
      </View>

      <Text variant="heading.sm">Vehicles</Text>
      {error ? <Notice message={error} /> : null}
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

      <Text variant="heading.sm">Delete account</Text>
      <Text tone="secondary">Deleting your account can’t be undone.</Text>
      <Button
        label="Delete my account"
        variant="danger"
        fullWidth
        loading={busy === 'delete'}
        onPress={() => void requestDeletion()}
      />
    </Screen>
  );
}
