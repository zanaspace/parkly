import { useTheme } from '@parkly/ui-native';
import { ActivityIndicator, View } from 'react-native';

/** Entry point: the route guard in _layout redirects from here once the session is known. */
export default function Index() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.bg.canvas,
      }}
      accessibilityLabel="Loading"
    >
      <ActivityIndicator color={theme.color.action.primary.bg} size="large" />
    </View>
  );
}
