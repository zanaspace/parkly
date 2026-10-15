import { Button, Text } from '@parkly/ui-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Screen } from '../../src/components/Screen';
import { VehicleForm } from '../../src/components/VehicleForm';

/**
 * D-05 Add vehicle. Skippable: a vehicle is only required to book, and the
 * booking flow offers an inline add-vehicle sheet (doc 03 §1.4).
 */
export default function Vehicle() {
  const auth = useAuth();
  return (
    <Screen
      footer={
        <Button
          label="Skip for now"
          variant="ghost"
          fullWidth
          onPress={() => void auth.skipVehicleStep()}
        />
      }
    >
      <Text variant="heading.lg">Add your car</Text>
      <Text tone="secondary">
        The attendant checks your plate at the gate. You can add up to 5 vehicles.
      </Text>
      <VehicleForm submitLabel="Add vehicle" onAdded={() => auth.refreshVehicles()} />
    </Screen>
  );
}
