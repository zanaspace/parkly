import { Button, Text, useTheme } from '@parkly/ui-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Sprint 0 proof screen: tokens + ui-native wired. Onboarding (D-01…) arrives in Sprint 1.
export default function Home() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          padding: theme.space.layout.gutter,
          gap: theme.space.stack.md,
        }}
      >
        <Text variant="overline" tone="brand">
          Parkly
        </Text>
        <Text variant="heading.xl">Safe, verified parking in Lagos</Text>
        <Text tone="secondary">
          Book a space at a verified lot before you leave home. Pay cashless, park without touts.
        </Text>
        <Button label="Get started" size="lg" fullWidth onPress={() => undefined} />
      </View>
    </SafeAreaView>
  );
}
