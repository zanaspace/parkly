import { useTheme } from '@parkly/ui-native';
import { Stack } from 'expo-router';
import { usePushTaps } from '../../src/notifications/push';

export default function GroupLayout() {
  const theme = useTheme();
  // Signed in: a tapped booking notice opens that booking.
  usePushTaps();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.bg.canvas },
      }}
    />
  );
}
