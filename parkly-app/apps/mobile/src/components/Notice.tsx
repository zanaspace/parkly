import { Text, useTheme } from '@parkly/ui-native';
import { View } from 'react-native';

type Kind = 'danger' | 'info' | 'success' | 'warning';
const PREFIX: Record<Kind, string> = {
  danger: 'Error',
  info: 'Note',
  success: 'Done',
  warning: 'Warning',
};

/** Inline status message. Colour plus a text prefix, never colour alone (doc 04 accessibility). */
export function Notice({ kind = 'danger', message }: { kind?: Kind; message: string }) {
  const theme = useTheme();
  const c = theme.color.status[kind];
  return (
    <View
      accessibilityRole={kind === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: c.bg,
        borderRadius: theme.radius.md,
        padding: theme.space.inset.md,
      }}
    >
      <Text variant="body.sm" style={{ color: c.fg }}>
        {`${PREFIX[kind]}: ${message}`}
      </Text>
    </View>
  );
}
