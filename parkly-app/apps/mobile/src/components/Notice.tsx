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
export function Notice({
  kind = 'danger',
  message,
  prefix,
  hidePrefix = false,
}: {
  kind?: Kind;
  message: string;
  prefix?: string;
  hidePrefix?: boolean;
}) {
  const theme = useTheme();
  const c = theme.color.status[kind];
  const label = hidePrefix ? message : `${prefix ?? PREFIX[kind]}: ${message}`;
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
        {label}
      </Text>
    </View>
  );
}
