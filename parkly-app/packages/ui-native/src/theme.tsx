import { theme as tokens, type Theme } from '@parkly/tokens/native';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type { Theme };
export type ColorSchemeName = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; scheme: ColorSchemeName } | null>(null);

/** Resolves light/dark from the OS, unless the user picked one (doc 07 §8). */
export function ThemeProvider({
  override,
  children,
}: {
  override?: ColorSchemeName;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme: ColorSchemeName = override ?? (system === 'dark' ? 'dark' : 'light');
  const value = useMemo(() => ({ theme: tokens[scheme], scheme }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx.theme;
}

export function useColorSchemeName(): ColorSchemeName {
  return useContext(ThemeContext)?.scheme ?? 'light';
}
