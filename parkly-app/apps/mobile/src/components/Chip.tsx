import { Text, useTheme } from '@parkly/ui-native';
import { Pressable } from 'react-native';

/** A selectable pill for short choices (area, day, duration, sort). */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingVertical: theme.space[2],
        paddingHorizontal: theme.space[3],
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.color.border.brand : theme.color.border.default,
        backgroundColor: selected
          ? theme.color.bg['brand-subtle']
          : pressed
            ? theme.color.bg.muted
            : theme.color.bg.surface,
      })}
    >
      <Text variant="body.sm" tone={selected ? 'brand' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}
