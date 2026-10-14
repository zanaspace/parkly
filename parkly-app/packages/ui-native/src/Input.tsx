import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text.js';
import { useTheme } from './theme.js';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  helper?: string;
  error?: string;
};

/** Label always rendered; error announced with an "Error:" prefix (doc 15 §3.2). */
export function Input({ label, helper, error, onFocus, onBlur, ...rest }: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const i = theme.input;
  const borderColor = error ? i['border-error'] : focused ? i['border-focus'] : i.border;

  return (
    <View style={{ gap: theme.space.stack.xs }}>
      <Text variant="label.md">{label}</Text>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : helper}
        placeholderTextColor={i.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          ...theme.type.body.md,
          height: i.height.md,
          paddingHorizontal: i['padding-x'],
          borderRadius: i.radius,
          borderWidth: focused || error ? i['border-width-focus'] : i['border-width'],
          borderColor,
          backgroundColor: rest.editable === false ? i['bg-disabled'] : i.bg,
          color: i.fg,
        }}
      />
      {error ? (
        <Text variant="caption" style={{ color: i['error-fg'] }} accessibilityLiveRegion="polite">
          {`Error: ${error}`}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="secondary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
