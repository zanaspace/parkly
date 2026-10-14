import { ActivityIndicator, Pressable, Text as RNText, type PressableProps } from 'react-native';
import {
  buttonColors,
  buttonMetrics,
  type ButtonSize,
  type ButtonVariant,
} from './button-style.js';
import { useTheme } from './theme.js';

export type ButtonProps = Omit<PressableProps, 'children' | 'disabled' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  onPress,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const m = buttonMetrics(theme, size);

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, loading` : label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={m.hitSlop}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => {
        const c = buttonColors(theme, variant, { pressed, inactive });
        return {
          height: m.height,
          paddingHorizontal: m.paddingHorizontal,
          borderRadius: m.borderRadius,
          backgroundColor: c.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.button.gap,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        };
      }}
    >
      {({ pressed }) => {
        const c = buttonColors(theme, variant, { pressed, inactive });
        return loading ? (
          <ActivityIndicator color={c.fg} size="small" />
        ) : (
          <RNText style={{ ...m.font, color: c.fg }}>{label}</RNText>
        );
      }}
    </Pressable>
  );
}
