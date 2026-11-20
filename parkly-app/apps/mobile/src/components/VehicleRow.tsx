import { Ionicons } from '@expo/vector-icons';
import type { Vehicle } from '@parkly/contracts';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { confirm } from '../lib/confirm';

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

export function VehicleRow({
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.color.bg['brand-subtle'],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="car-outline" size={18} color={theme.color.text.brand} />
          </View>
          <Text variant="code.md">{vehicle.plateNorm}</Text>
        </View>
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
