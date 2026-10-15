import type { Vehicle } from '@parkly/contracts';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useState } from 'react';
import { View } from 'react-native';
import { checkPlate } from '../logic/forms';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { Notice } from './Notice';

/** D-05 add vehicle: plate with a live preview of how the gate will read it. */
export function VehicleForm({
  submitLabel,
  onAdded,
}: {
  submitLabel: string;
  onAdded: (vehicle: Vehicle) => void | Promise<void>;
}) {
  const theme = useTheme();
  const [plate, setPlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = checkPlate(plate);
  // The API rejects plates it cannot read, so block them here with a clear message.
  const plateError =
    touched && plate.trim() && !check.valid
      ? 'Plates have 5–10 letters and numbers, e.g. LND-123-AB.'
      : undefined;

  async function submit() {
    setTouched(true);
    if (!check.valid) return;
    setBusy(true);
    setError(null);
    try {
      const vehicle = await api.addVehicle({
        plate: plate.trim(),
        ...(make.trim() ? { make: make.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(colour.trim() ? { colour: colour.trim() } : {}),
      });
      await onAdded(vehicle);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not save the vehicle. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: theme.space.stack.md }}>
      <Input
        label="Plate number"
        value={plate}
        onChangeText={setPlate}
        onBlur={() => setTouched(true)}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="LND-123-AB"
        {...(plateError ? { error: plateError } : {})}
      />
      {check.valid ? (
        <Text variant="body.sm" tone="secondary" accessibilityLiveRegion="polite">
          {'Attendants will see: '}
          <Text variant="code.md">{check.normalised}</Text>
        </Text>
      ) : null}
      <Input label="Make (optional)" value={make} onChangeText={setMake} placeholder="Toyota" />
      <Input label="Model (optional)" value={model} onChangeText={setModel} placeholder="Corolla" />
      <Input
        label="Colour (optional)"
        value={colour}
        onChangeText={setColour}
        placeholder="Silver"
      />
      {error ? <Notice message={error} /> : null}
      <Button
        label={submitLabel}
        size="lg"
        fullWidth
        loading={busy}
        onPress={() => void submit()}
      />
    </View>
  );
}
