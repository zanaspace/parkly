import type { Theme } from '@parkly/tokens/native';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Pure style resolution so it can be unit tested without a native runtime. */
export function buttonColors(
  theme: Theme,
  variant: ButtonVariant,
  state: { pressed: boolean; inactive: boolean },
): { bg: string; fg: string } {
  const b = theme.button;
  if (state.inactive) return { bg: b.disabled.bg, fg: b.disabled.fg };
  switch (variant) {
    case 'primary':
      return { bg: state.pressed ? b.primary['bg-pressed'] : b.primary.bg, fg: b.primary.fg };
    case 'secondary':
      return { bg: state.pressed ? b.secondary['bg-pressed'] : b.secondary.bg, fg: b.secondary.fg };
    case 'ghost':
      return { bg: state.pressed ? b.ghost['bg-pressed'] : 'transparent', fg: b.ghost.fg };
    case 'danger':
      return { bg: b.danger.bg, fg: b.danger.fg };
  }
}

export function buttonMetrics(theme: Theme, size: ButtonSize) {
  return {
    // Native minimum touch target is 48 dp even for sm (doc 16 §5); sm is only visually shorter.
    height: theme.button.height[size],
    minHeight: Math.min(theme.button.height[size], theme.target.min),
    paddingHorizontal: theme.button['padding-x'][size],
    borderRadius: size === 'sm' ? theme.button['radius-sm'] : theme.button.radius,
    hitSlop: Math.max(0, (theme.target.min - theme.button.height[size]) / 2),
    font: size === 'lg' ? theme.type.label.lg : theme.type.label.md,
  };
}
