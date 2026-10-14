import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';

export type TextVariant =
  | 'display-lg'
  | 'display-md'
  | 'heading-xl'
  | 'heading-lg'
  | 'heading-md'
  | 'heading-sm'
  | 'body-lg'
  | 'body-md'
  | 'body-sm'
  | 'caption'
  | 'label-lg'
  | 'label-md'
  | 'label-sm'
  | 'overline'
  | 'price-lg'
  | 'price-md'
  | 'price-sm'
  | 'code-lg'
  | 'code-md'
  | 'code-sm';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'brand';

const DEFAULT_ELEMENT: Partial<Record<TextVariant, ElementType>> = {
  'display-lg': 'h1',
  'display-md': 'h1',
  'heading-xl': 'h1',
  'heading-lg': 'h2',
  'heading-md': 'h3',
  'heading-sm': 'h4',
};

/** Every type token's five CSS variables (doc 08 §7). */
function typeStyle(variant: TextVariant): CSSProperties {
  const v = (prop: string) => `var(--pk-type-${variant}-${prop})`;
  return {
    fontFamily: v('font-family'),
    fontSize: v('font-size'),
    fontWeight: v('font-weight'),
    lineHeight: v('line-height'),
    letterSpacing: v('letter-spacing'),
    ...(variant === 'overline' ? { textTransform: 'uppercase' } : {}),
  };
}

export type TextProps = HTMLAttributes<HTMLElement> & {
  variant?: TextVariant;
  tone?: TextTone;
  as?: ElementType;
  children: ReactNode;
};

export function Text({
  variant = 'body-md',
  tone = 'primary',
  as,
  className,
  style,
  children,
  ...rest
}: TextProps) {
  const Component = as ?? DEFAULT_ELEMENT[variant] ?? 'p';
  const classes = [
    'pk-text',
    tone !== 'primary' && `pk-text--${tone}`,
    variant.startsWith('price') && 'pk-text--tabular',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Component {...rest} className={classes} style={{ ...typeStyle(variant), ...style }}>
      {children}
    </Component>
  );
}
