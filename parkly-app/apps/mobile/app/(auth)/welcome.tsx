import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '../../src/components/Screen';

/** D-01 Welcome. "Browse lots without signing in" arrives with search (Sprint 3). */
export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Screen
      footer={
        <Button label="Get started" size="lg" fullWidth onPress={() => router.push('/email')} />
      }
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', gap: theme.space.stack.md }}>
        <Text variant="overline" tone="brand">
          Parkly
        </Text>
        <Text variant="heading.xl">Safe, verified parking in Lagos</Text>
        <Text tone="secondary">
          Book a space at a verified lot before you leave home. Pay cashless, park without touts.
        </Text>
      </View>
    </Screen>
  );
}
