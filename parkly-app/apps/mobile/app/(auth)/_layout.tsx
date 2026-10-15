import { useTheme } from '@parkly/ui-native';
import { Stack } from 'expo-router';

export default function GroupLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.bg.canvas },
      }}
    />
  );
}
