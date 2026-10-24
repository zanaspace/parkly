import { Button, Text } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/AuthProvider';
import { Screen } from '../../src/components/Screen';
import { VehicleForm } from '../../src/components/VehicleForm';

export default function AddVehicle() {
  const auth = useAuth();
  const router = useRouter();
  return (
    <Screen
      footer={
        <Button
          label="Cancel"
          variant="ghost"
          fullWidth
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
        />
      }
    >
      <Text variant="heading.lg">Add a vehicle</Text>
      <VehicleForm
        submitLabel="Save vehicle"
        onAdded={async () => {
          await auth.refreshVehicles();
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/account');
          }
        }}
      />
    </Screen>
  );
}

