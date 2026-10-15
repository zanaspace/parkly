import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';

/** D-10 Home. Placeholder until search (Sprint 3). */
export default function Home() {
  const theme = useTheme();
  const router = useRouter();
  const { me, vehicles } = useAuth();
  const defaultVehicle = vehicles?.find((v) => v.isDefault);

  return (
    <Screen
      footer={
        <Button
          label="Account"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/account')}
        />
      }
    >
      <Text variant="overline" tone="brand">
        Parkly
      </Text>
      <Text variant="heading.xl">{me?.firstName ? `Hello, ${me.firstName}` : 'Hello'}</Text>
      <View style={{ gap: theme.space.stack.sm }}>
        {defaultVehicle ? (
          <Text tone="secondary">
            {'Parking with '}
            <Text variant="code.md">{defaultVehicle.plateNorm}</Text>
          </Text>
        ) : (
          <Text tone="secondary">Add a vehicle in Account before your first booking.</Text>
        )}
      </View>
      <Notice kind="info" message="Searching and booking verified lots is coming soon." />
    </Screen>
  );
}
