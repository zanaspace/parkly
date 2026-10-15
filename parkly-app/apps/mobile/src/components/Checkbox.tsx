import { Text, useTheme } from '@parkly/ui-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

/** Accessible checkbox row: the whole row is the 48dp touch target (doc 16 targets). */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
}) {
  const theme = useTheme();
  const size = 24;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: 'row',
        gap: theme.space.inline.sm,
        minHeight: theme.target.min,
        alignItems: 'flex-start',
        paddingVertical: theme.space.inset.xs,
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          marginTop: 2,
          borderRadius: theme.radius.xs,
          borderWidth: 2,
          borderColor: checked ? theme.color.action.primary.bg : theme.color.border.strong,
          backgroundColor: checked ? theme.color.action.primary.bg : theme.color.bg.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          <Text variant="label.md" tone="on-brand" importantForAccessibility="no">
            ✓
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: theme.space.stack.xs }}>
        <Text variant="body.md">{label}</Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
