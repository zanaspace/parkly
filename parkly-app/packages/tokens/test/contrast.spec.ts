import { describe, expect, it } from 'vitest';
import { theme, type Theme } from '../dist/native/theme.js';

// WCAG 2.x relative luminance contrast (doc 07 §5).
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const get = (t: Theme, path: string): string => {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], t.color);
  if (typeof value !== 'string') throw new Error(`no colour at color.${path}`);
  return value;
};

type Pair = [fg: string, bg: string, target: number];

// Every row of doc 07 §5 (except the disabled pair, exempt by WCAG 1.4.3).
const light: Pair[] = [
  ['text.primary', 'bg.surface', 4.5],
  ['text.primary', 'bg.canvas', 4.5],
  ['text.secondary', 'bg.surface', 4.5],
  ['text.secondary', 'bg.canvas', 4.5],
  ['text.tertiary', 'bg.surface', 4.5],
  ['action.primary.fg', 'action.primary.bg', 4.5],
  ['action.primary.fg', 'action.primary.bg-hover', 4.5],
  ['action.primary.fg', 'action.primary.bg-pressed', 4.5],
  ['text.link', 'bg.surface', 4.5],
  ['text.brand', 'bg.surface', 4.5],
  ['verified.fg', 'verified.bg', 4.5],
  ['status.warning.fg', 'status.warning.bg', 4.5],
  ['accent.on-solid', 'accent.solid', 4.5],
  ['status.danger.fg', 'bg.surface', 4.5],
  ['action.danger.fg', 'action.danger.bg', 4.5],
  ['status.danger.fg', 'status.danger.bg', 4.5],
  ['status.success.fg', 'status.success.bg', 4.5],
  ['status.info.fg', 'status.info.bg', 4.5],
  ['action.secondary.fg', 'action.secondary.bg', 4.5],
  ['border.strong', 'bg.surface', 3],
  ['focus.ring', 'bg.surface', 3],
  ['text.on-brand', 'bg.brand', 4.5],
  ['text.inverse', 'bg.inverse', 4.5],
];

const dark: Pair[] = [
  ['text.primary', 'bg.canvas', 4.5],
  ['text.primary', 'bg.surface', 4.5],
  ['text.secondary', 'bg.canvas', 4.5],
  ['text.secondary', 'bg.surface', 4.5],
  ['text.tertiary', 'bg.surface', 4.5],
  ['action.primary.fg', 'action.primary.bg', 4.5],
  ['text.brand', 'bg.surface', 4.5],
  ['status.warning.fg', 'bg.surface', 4.5],
  ['verified.fg', 'bg.surface', 4.5],
  ['status.danger.fg', 'bg.surface', 4.5],
  ['status.success.fg', 'bg.surface', 4.5],
  ['status.info.fg', 'bg.surface', 4.5],
  ['border.strong', 'bg.surface', 3],
  ['focus.ring', 'bg.canvas', 3],
  ['text.on-brand', 'bg.brand', 4.5],
  ['status.success.fg', 'status.success.bg', 4.5],
  ['status.warning.fg', 'status.warning.bg', 4.5],
  ['verified.fg', 'verified.bg', 4.5],
  ['status.danger.fg', 'status.danger.bg', 4.5],
  ['action.danger.fg', 'action.danger.bg', 4.5],
  ['status.info.fg', 'status.info.bg', 4.5],
  ['action.secondary.fg', 'action.secondary.bg', 4.5],
  ['offline.fg', 'offline.bg', 4.5],
  ['text.primary', 'bg.surface-raised', 4.5],
  ['text.inverse', 'bg.inverse', 4.5],
];

describe('contrast (doc 07 §5)', () => {
  it('matches the published ratio for a known pair', () => {
    expect(contrast('#FFFFFF', '#137066')).toBeCloseTo(5.94, 2);
  });

  it.each(light)('light: %s on %s ≥ %d:1', (fg, bg, target) => {
    expect(contrast(get(theme.light, fg), get(theme.light, bg))).toBeGreaterThanOrEqual(target);
  });

  it.each(dark)('dark: %s on %s ≥ %d:1', (fg, bg, target) => {
    expect(contrast(get(theme.dark, fg), get(theme.dark, bg))).toBeGreaterThanOrEqual(target);
  });

  it('QR codes are black on white in both themes', () => {
    for (const t of [theme.light, theme.dark]) {
      expect([get(t, 'qr.fg'), get(t, 'qr.bg')]).toEqual(['#000000', '#FFFFFF']);
    }
  });
});

describe('component tokens resolve', () => {
  it('every button colour resolves to a hex value in both themes', () => {
    for (const t of [theme.light, theme.dark]) {
      for (const variant of Object.values(t.button)) {
        if (typeof variant !== 'object') continue;
        for (const value of Object.values(variant)) {
          if (typeof value === 'string' && value.startsWith('#'))
            expect(value).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/);
        }
      }
    }
    expect(theme.dark.button.primary.bg).toBe('#71C4B8');
  });
});
