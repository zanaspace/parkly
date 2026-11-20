import { Text, useTheme } from '@parkly/ui-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

/** Settings/menu row (doc 15 §2 row 29): optional leading icon badge, label + optional helper text, chevron or spinner. */
export function ListItem({
  label,
  description,
  onPress,
  icon,
  iconBg,
  tone = 'default',
  loading = false,
  disabled = false,
  showChevron = true,
}: {
  label: string;
  description?: string;
  onPress: () => void;
  icon?: React.ReactNode;
  iconBg?: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  showChevron?: boolean;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: theme.target.min,
        paddingVertical: theme.space.stack.sm,
        paddingHorizontal: theme.space.inset.md,
        gap: theme.space.inline.sm,
        opacity: disabled ? theme.opacity.disabled : 1,
        backgroundColor: pressed ? theme.color.bg.subtle : 'transparent',
      })}
    >
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor:
              iconBg ??
              (tone === 'danger'
                ? theme.color.status.danger.bg
                : theme.color.bg['brand-subtle']),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="label.md"
          style={{
            color: tone === 'danger' ? theme.color.status.danger.fg : theme.color.text.primary,
          }}
        >
          {label}
        </Text>
        {description ? (
          <Text variant="body.sm" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={theme.color.text.secondary} />
      ) : showChevron ? (
        <Text variant="label.lg" tone="tertiary">
          ›
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Groups ListItems into one card with dividers between rows (doc 15 §3.3 Card). */
export function ListItemGroup({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const rows = Array.isArray(children) ? children : [children];
  return (
    <View
      style={{
        backgroundColor: theme.card.bg,
        borderWidth: 1,
        borderColor: theme.card.border,
        borderRadius: theme.card.radius,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, i) => (
        <View
          key={i}
          style={
            i > 0 ? { borderTopWidth: 1, borderTopColor: theme.color.border.default } : undefined
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}
