import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme, type Theme } from './theme.js';

type TypeGroup = Theme['type'];
type Leaf<G> = G extends { fontFamily: string } ? never : keyof G & string;
export type TextVariant = {
  [K in keyof TypeGroup & string]: TypeGroup[K] extends { fontFamily: string }
    ? K
    : `${K}.${Leaf<TypeGroup[K]>}`;
}[keyof TypeGroup & string];

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'inverse' | 'on-brand';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

const HEADINGS = new Set(['display', 'heading']);

export function Text({ variant = 'body.md', tone = 'primary', style, ...rest }: TextProps) {
  const theme = useTheme();
  const [group, size] = variant.split('.') as [keyof TypeGroup, string | undefined];
  const node = theme.type[group] as Record<string, unknown>;
  const typeStyle = (size ? node[size] : node) as object;
  return (
    <RNText
      accessibilityRole={HEADINGS.has(group) ? 'header' : undefined}
      {...rest}
      style={[typeStyle, { color: theme.color.text[tone] }, style]}
    />
  );
}
